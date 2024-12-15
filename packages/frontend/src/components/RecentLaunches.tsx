// components/RecentLaunches.tsx
import { Token } from '@/types/token'
import { config } from '@/config'
import { useContractRead } from 'wagmi'
import { MEMECOIN_LAUNCHPAD_ADDRESS, MEMECOIN_LAUNCHPAD_ABI } from '@/constants/contracts'

interface RecentLaunchesProps {
  tokens: Token[]
}

export const RecentLaunches = ({ tokens }: RecentLaunchesProps) => {
  return (
    <div className="space-y-6 bg-white p-8 rounded-lg border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
      <div>
        <h2 className="text-3xl font-black text-[#2B2730] transform -rotate-1">
          <span className="bg-[#96EFFF] px-2 inline-block">Latest Memecoins 🔥</span>
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          Fresh memes just dropped! Check out these newly launched gems 💎
        </p>
      </div>

      <div className="space-y-4">
        {tokens.map((token) => (
          <div key={token.id} className="p-6 border-2 border-black rounded-lg space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold">{token.name} 
                <span className="bg-[#FFE5E5] px-2 py-1 ml-2 text-sm">
                  ${token.symbol}
                </span>
              </h3>
              <span className="text-sm">
                {new Date(token.timestamp).toLocaleDateString()}
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-lg">Supply: {token.supply} tokens</p>
              <p className="text-sm font-mono bg-gray-100 p-2">
                Token Address: {token.address}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}