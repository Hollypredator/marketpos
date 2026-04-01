import React from 'react';

export interface FeedbackBannerModel {
  text: string;
  type: 'error' | 'success';
}

interface FeedbackBannerProps {
  message: FeedbackBannerModel | null;
}

export function FeedbackBanner({ message }: FeedbackBannerProps): React.ReactElement | null {
  if (!message) {
    return null;
  }
  return <div className={`banner ${message.type}`}>{message.text}</div>;
}
