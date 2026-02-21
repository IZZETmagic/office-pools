import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { FAQAccordion } from './FAQAccordion'

const features = [
  {
    icon: '➕',
    title: 'Create Your Pool in Minutes',
    description:
      'Set up your World Cup pool in seconds. Customize scoring rules, invite friends, and start predicting.',
  },
  {
    icon: '🎯',
    title: 'Predict All 104 Matches',
    description:
      'Make predictions for every World Cup match from group stage to the final. PSO predictions included.',
  },
  {
    icon: '🏆',
    title: 'Live Rankings & Points',
    description:
      'Track your performance with automatic point calculation and live leaderboard updates.',
  },
  {
    icon: '⚙️',
    title: 'Customizable Scoring Rules',
    description:
      'Pool admins can customize point values for exact scores, correct results, and bonus predictions.',
  },
]

const steps = [
  {
    number: '1',
    title: 'Create Your Pool',
    description:
      'Sign up and create a pool for the 2026 World Cup. Set your scoring rules and pool settings.',
  },
  {
    number: '2',
    title: 'Invite Friends',
    description:
      'Share your unique pool code with friends, family, or coworkers. They join with one click.',
  },
  {
    number: '3',
    title: 'Make Predictions & Compete',
    description:
      'Predict match results before the deadline. Points are automatically calculated and rankings updated live.',
  },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="text-xl font-bold text-gray-900">
              ⚽ Sport Pool
            </Link>
            <div className="flex items-center gap-3">
              <Button href="/login" variant="outline" size="sm">
                Log In
              </Button>
              <Button href="/signup" size="sm">
                Sign Up
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-emerald-600">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.05%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-50" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-32 lg:py-40">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-tight">
              Create Your FIFA World Cup 2026 Prediction Pool
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto">
              Compete with friends, predict match results, and climb the
              leaderboard. The ultimate way to experience the World Cup.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Button href="/signup" variant="green" size="lg" className="text-lg px-8 py-4">
                Get Started &mdash; Free
              </Button>
              <a
                href="#features"
                className="inline-flex items-center justify-center rounded-lg px-8 py-4 text-lg font-semibold text-white border-2 border-white/30 hover:bg-white/10 transition"
              >
                Learn More ↓
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 sm:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Everything You Need for the Perfect Pool
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              From pool creation to live leaderboards, we&apos;ve got you covered.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Get Started in 3 Simple Steps
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 relative">
            {/* Connecting line (desktop only) */}
            <div className="hidden md:block absolute top-12 left-[20%] right-[20%] h-0.5 bg-blue-200" />
            {steps.map((step) => (
              <div key={step.number} className="relative text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-600 text-white text-xl font-bold mb-4 relative z-10">
                  {step.number}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {step.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-16 sm:py-24 bg-gradient-to-r from-blue-600 to-emerald-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to Start Your Pool?
          </h2>
          <p className="text-lg text-blue-100 mb-8 max-w-2xl mx-auto">
            Join fans around the world predicting the FIFA World Cup 2026.
            Setting up your pool takes less than a minute.
          </p>
          <Button href="/signup" variant="green" size="lg" className="text-lg px-10 py-4">
            Create Your Pool &mdash; Free
          </Button>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 sm:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Frequently Asked Questions
            </h2>
          </div>
          <FAQAccordion />
        </div>
      </section>

    </div>
  )
}
