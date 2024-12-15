// App.tsx
import { useState } from 'react'
import { TokenDeployer } from '@/components/TokenDeployer'
import { RecentLaunches } from '@/components/RecentLaunches'
import { Token } from '@/types/token'
import { Toaster } from '@/components/ui/toaster'

function App2() {
  const [tokens, setTokens] = useState<Token[]>([])

  const handleNewToken = (token: Token) => {
    setTokens(prev => [token, ...prev])
  }

  return (
    <div className="min-h-screen bg-[#FFECD6] pattern-cross pattern-yellow-100 pattern-bg-white pattern-size-4 pattern-opacity-10">
      <div className="container mx-auto py-16 px-4">
        <h1 className="text-6xl font-black text-center mb-16 text-[#2B2730] transform -rotate-2">
          <span className="bg-[#FF6B6B] px-4 py-2 inline-block shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            Superchain Memecoin Launchpad 🚀
          </span>
        </h1>
        <div className="grid gap-10 md:grid-cols-2">
          <TokenDeployer onDeploy={handleNewToken} />
          <RecentLaunches tokens={tokens} />
        </div>
      </div>
      <Toaster />
    </div>
  )
}

export default App2