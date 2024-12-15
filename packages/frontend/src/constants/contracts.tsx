// src/constants/contracts.ts
export const MEMECOIN_LAUNCHPAD_ADDRESS = "0x0000000000000000000000000000000000000000"
export const MEMECOIN_LAUNCHPAD_ABI = [
    {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "tokenAddress",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "name",
            "type": "string"
          },
          {
            "indexed": false,
            "name": "symbol",
            "type": "string"
          },
          {
            "indexed": false,
            "name": "decimals",
            "type": "uint8"
          }
        ],
        "name": "TokenDeployed",
        "type": "event"
      }
] as const
