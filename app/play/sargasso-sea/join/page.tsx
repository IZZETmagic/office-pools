import { redirect } from 'next/navigation'
import { POOL_CONFIG } from '../poolConfig'

// This page redirects to the real join flow for the Sargasso Sea pool
export default function SargassoSeaJoinPage() {
  redirect(`/join/${POOL_CONFIG.poolCode}`)
}
