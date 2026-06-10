// Pre-auth onboarding pager — three slides (Problem, Solution, Three ways
// to play). Both "Get started" and Skip mark the onboarding-seen flag and
// let the root-layout gate route the user to the correct next destination
// (sign-in if unauthed, notifications/tabs if somehow already authed).
// This keeps all routing decisions in one place.

import { useCallback } from 'react';

import { OnboardingPager } from '@/components/onboarding/OnboardingPager';
import { SLIDES } from '@/components/onboarding/slides';
import { markOnboardingSeen } from '@/lib/useOnboardingProgress';

export default function OnboardingIndex() {
  const finish = useCallback(() => {
    void markOnboardingSeen();
  }, []);

  return <OnboardingPager slides={SLIDES} onFinish={finish} onSkip={finish} />;
}
