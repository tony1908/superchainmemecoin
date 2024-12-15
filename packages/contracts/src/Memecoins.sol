// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {L2NativeSuperchainERC20} from "./L2NativeSuperchainERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract MemecoinsLaunchpad is Ownable, ReentrancyGuard {
    struct TokenConfig {
        string name;
        string symbol;
        uint8 decimals;
        bytes32 salt;
    }

    struct LaunchConfig {
        uint256 initialPrice;
        uint256 reserveRatio; // in basis points (1-100%)
        uint256 maxSupply;
        uint256 minPurchase;
        uint256 maxPurchase;
    }

    struct TokenInfo {
        L2NativeSuperchainERC20 token;
        LaunchConfig config;
        uint256 currentSupply;
        uint256 poolBalance;
        bool isActive;
    }

    mapping(address => TokenInfo) public tokenInfo;

    event TokenDeployed(
        address indexed tokenAddress,
        string name,
        string symbol,
        uint8 decimals
    );
    event TokenLaunched(address indexed tokenAddress, LaunchConfig config);
    event TokenPurchased(
        address indexed buyer,
        address indexed tokenAddress,
        uint256 ethAmount,
        uint256 tokenAmount
    );
    event TokenSold(
        address indexed seller,
        address indexed tokenAddress,
        uint256 tokenAmount,
        uint256 ethAmount
    );

    constructor() Ownable(msg.sender) {}

    function deployAndLaunchToken(
        TokenConfig memory tokenConfig,
        LaunchConfig memory launchConfig
    ) external onlyOwner returns (address) {
        // Deploy new token
        address tokenAddress = deployToken(tokenConfig);
        
        // Launch the token
        launchToken(tokenAddress, launchConfig);

        return tokenAddress;
    }

    function deployToken(TokenConfig memory config) public onlyOwner returns (address) {
        bytes memory initCode = abi.encodePacked(
            type(L2NativeSuperchainERC20).creationCode,
            abi.encode(msg.sender, config.name, config.symbol, config.decimals)
        );

        address preComputedAddress = computeCreate2Address(config.salt, keccak256(initCode));
        
        if (preComputedAddress.code.length > 0) {
            return preComputedAddress;
        }

        address tokenAddress;
        assembly {
            tokenAddress := create2(0, add(initCode, 0x20), mload(initCode), config.salt)
        }
        require(tokenAddress != address(0), "Failed to deploy token");
        require(tokenAddress == preComputedAddress, "Deployment address mismatch");

        emit TokenDeployed(
            tokenAddress,
            config.name,
            config.symbol,
            config.decimals
        );

        return tokenAddress;
    }

    function computeCreate2Address(bytes32 salt, bytes32 initCodeHash) public view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            initCodeHash
        )))));
    }

    function launchToken(
        address tokenAddress,
        LaunchConfig memory config
    ) public onlyOwner {
        require(config.reserveRatio > 0 && config.reserveRatio <= 10000, "Invalid reserve ratio");
        require(config.initialPrice > 0, "Invalid initial price");
        require(config.maxSupply > 0, "Invalid max supply");
        require(config.minPurchase <= config.maxPurchase, "Invalid purchase limits");

        TokenInfo storage info = tokenInfo[tokenAddress];
        require(!info.isActive, "Token already launched");

        info.token = L2NativeSuperchainERC20(tokenAddress);
        info.config = config;
        info.isActive = true;
        info.currentSupply = 0;
        info.poolBalance = 0;

        emit TokenLaunched(tokenAddress, config);
    }

    function calculatePurchaseReturn(
        address tokenAddress,
        uint256 ethAmount
    ) public view returns (uint256) {
        TokenInfo storage info = tokenInfo[tokenAddress];
        require(info.isActive, "Token not active");

        if (info.currentSupply == 0) {
            return (ethAmount * 1e18) / info.config.initialPrice;
        }

        uint256 supply = info.currentSupply;
        uint256 balance = info.poolBalance;
        uint256 reserveRatio = info.config.reserveRatio;

        // Using bancor formula: Return = Supply * ((1 + depositAmount/balance)^(reserveRatio/10000) - 1)
        uint256 result = Math.mulDiv(
            supply,
            (
                Math.pow(
                    (balance + ethAmount) * 10000 / balance,
                    reserveRatio
                ) - 10000
            ),
            10000
        );

        require(info.currentSupply + result <= info.config.maxSupply, "Exceeds max supply");
        return result;
    }

    function calculateSaleReturn(
        address tokenAddress,
        uint256 tokenAmount
    ) public view returns (uint256) {
        TokenInfo storage info = tokenInfo[tokenAddress];
        require(info.isActive, "Token not active");
        require(info.currentSupply > 0, "No tokens in circulation");

        uint256 supply = info.currentSupply;
        uint256 balance = info.poolBalance;
        uint256 reserveRatio = info.config.reserveRatio;

        // Using bancor formula: Return = Balance * (1 - (1 - tokenAmount/supply)^(10000/reserveRatio))
        return Math.mulDiv(
            balance,
            10000 - Math.pow(
                (supply - tokenAmount) * 10000 / supply,
                10000 / reserveRatio
            ),
            10000
        );
    }

    function buyTokens(address tokenAddress) external payable nonReentrant {
        TokenInfo storage info = tokenInfo[tokenAddress];
        require(info.isActive, "Token not active");
        require(msg.value >= info.config.minPurchase, "Below minimum purchase");
        require(msg.value <= info.config.maxPurchase, "Exceeds maximum purchase");

        uint256 tokenAmount = calculatePurchaseReturn(tokenAddress, msg.value);
        require(tokenAmount > 0, "Invalid token amount");

        info.currentSupply += tokenAmount;
        info.poolBalance += msg.value;

        info.token.mint(msg.sender, tokenAmount);

        emit TokenPurchased(msg.sender, tokenAddress, msg.value, tokenAmount);
    }

    function sellTokens(address tokenAddress, uint256 tokenAmount) external nonReentrant {
        TokenInfo storage info = tokenInfo[tokenAddress];
        require(info.isActive, "Token not active");
        require(tokenAmount > 0, "Invalid amount");

        uint256 ethReturn = calculateSaleReturn(tokenAddress, tokenAmount);
        require(ethReturn > 0 && ethReturn <= info.poolBalance, "Invalid return amount");

        info.currentSupply -= tokenAmount;
        info.poolBalance -= ethReturn;

        info.token.burnFrom(msg.sender, tokenAmount);
        
        (bool success, ) = msg.sender.call{value: ethReturn}("");
        require(success, "ETH transfer failed");

        emit TokenSold(msg.sender, tokenAddress, tokenAmount, ethReturn);
    }

    function getTokenInfo(address tokenAddress) external view returns (
        TokenInfo memory info
    ) {
        return tokenInfo[tokenAddress];
    }
}
