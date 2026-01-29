import { createPortal } from 'react-dom';

interface FeedbackTooltipProps {
  feedback: string | null;
  visible: boolean;
  position: { x: number; y: number };
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function FeedbackTooltip({
  feedback,
  visible,
  position,
  onMouseEnter,
  onMouseLeave,
}: FeedbackTooltipProps) {
  const isLoading = feedback === null;

  if (!visible) return null;

  const tooltipContent = (
    <div
      className={`feedback-tooltip ${visible ? 'visible' : ''} ${isLoading ? 'loading' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translateY(calc(-100% - 8px))',
        maxWidth: '400px',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="feedback-content">
        <span className="feedback-text">
          {isLoading ? '' : feedback || 'No feedback available'}
        </span>
      </div>
      <div className="feedback-loading">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  );

  return createPortal(tooltipContent, document.body);
}
