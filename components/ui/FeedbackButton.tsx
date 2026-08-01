'use client';

import { Icon } from '@/components/ui/Icon'
export default function FeedbackButton() {
  // Temporarily hidden — return null to disable without removing code
  return null;

  return (
    <a
      href="https://docs.google.com/forms/d/e/1FAIpQLSdYWKCdg11UZixjBgSiRpeeiOPT3RkYEHG17k8VRYRvYNQxbA/viewform?usp=publish-editor"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary-600 px-4 py-3 text-white shadow-lg transition-all hover:bg-primary-700 hover:shadow-xl active:scale-95 sm:px-5"
      aria-label="Send feedback"
    >
      <Icon name="bubble.left" size={20} className="shrink-0" />
      <span className="text-sm font-medium hidden sm:inline">Feedback</span>
    </a>
  );
}
