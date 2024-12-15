// components/TokenDeployer.tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAccount, useContractWrite, useWaitForTransaction } from 'wagmi'
import { MEMECOIN_LAUNCHPAD_ADDRESS, MEMECOIN_LAUNCHPAD_ABI } from '@/constants/contracts'
import { parseEther } from 'viem'
import { useToast } from './ui/use-toast'

export const TokenDeployer = ({ onDeploy }: { onDeploy: (token: Token) => void }) => {
  const [tokenName, setTokenName] = useState('')
  const [tokenSymbol, setTokenSymbol] = useState('')
  const { address } = useAccount()
  const { toast } = useToast()

  // Hardcoded launch configuration
  const launchConfig = {
    initialPrice: parseEther('0.0001'),
    reserveRatio: 5000,
    maxSupply: parseEther('1000000'),
    minPurchase: parseEther('0.01'),
    maxPurchase: parseEther('10'),
  }

  const { write: deployToken, data: deployData } = useContractWrite({
    address: MEMECOIN_LAUNCHPAD_ADDRESS,
    abi: MEMECOIN_LAUNCHPAD_ABI,
    functionName: 'deployAndLaunchToken',
  })

  const { isLoading: isDeploying } = useWaitForTransaction({
    hash: deployData?.hash,
    onSuccess(data) {
      // Extract token address from the TokenDeployed event
      const tokenDeployedEvent = data.logs.find(
        log => log.address.toLowerCase() === MEMECOIN_LAUNCHPAD_ADDRESS.toLowerCase()
      )
      
      if (!tokenDeployedEvent) {
        toast({
          title: "Error",
          description: "Could not find deployment event",
          variant: "destructive"
        })
        return
      }

      // Parse the event data to get the token address (first topic after the event signature)
      const tokenAddress = tokenDeployedEvent.topics[1]
      
      const newToken = {
        id: tokenAddress,
        name: tokenName,
        symbol: tokenSymbol,
        supply: launchConfig.maxSupply.toString(),
        networks: ['1'], // Assuming deployment network
        timestamp: Date.now(),
        address: tokenAddress
      }

      onDeploy(newToken)
      toast({
        title: "Success!",
        description: `${tokenName} has been deployed at ${tokenAddress}`,
      })

      // Reset form
      setTokenName('')
      setTokenSymbol('')
    },
    onError(error) {
      toast({
        title: "Error",
        description: "Failed to deploy token: " + error.message,
        variant: "destructive"
      })
    }
  })

  const handleDeploy = async () => {
    if (!tokenName || !tokenSymbol) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive"
      })
      return
    }

    try {
      const tokenConfig = {
        name: tokenName,
        symbol: tokenSymbol,
        decimals: 18,
        salt: `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')}`
      }

      deployToken({
        args: [tokenConfig, launchConfig],
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to deploy token",
        variant: "destructive"
      })
    }
  }

  return (
    <div className="space-y-6 bg-white p-8 rounded-lg border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
      <div>
        <h2 className="text-3xl font-black text-[#2B2730] transform -rotate-1">
          <span className="bg-[#96EFFF] px-2 inline-block">Launch Your Memecoin 🐸</span>
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          Create the next viral memecoin! WAGMI! 🌟
        </p>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label className="text-lg font-bold">Token Name</Label>
          <Input
            className="border-2 border-black rounded-md p-3"
            placeholder="My Awesome Token"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-lg font-bold">Token Symbol</Label>
          <Input
            className="border-2 border-black rounded-md p-3"
            placeholder="TOKEN"
            value={tokenSymbol}
            onChange={(e) => setTokenSymbol(e.target.value)}
          />
        </div>

        <Button 
          className="w-full bg-[#FF6B6B] text-white text-xl font-bold py-6 border-2 border-black rounded-md shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
          onClick={handleDeploy}
          disabled={isDeploying || !address}
        >
          {isDeploying ? "Deploying... 🚀" : "Deploy Token 🚀"}
        </Button>
      </div>
    </div>
  )
}