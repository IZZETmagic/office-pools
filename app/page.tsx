import { Button } from '@/components/ui/Button'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="text-center max-w-2xl">
        <h1 className="text-6xl font-bold text-gray-900 mb-6">
          ⚽ World Cup Office Pool
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Predict match results, compete with friends, and win bragging rights!
        </p>
        <div className="flex gap-4 justify-center">
          <Button href="/signup" size="lg">
            Get Started
          </Button>
          <Button href="/login" variant="outline" size="lg">
            Sign In
          </Button>
        </div>
      </div>
    </div>
  )
}