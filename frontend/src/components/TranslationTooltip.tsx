import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslator } from '../hooks/useTranslator';

interface TranslationTooltipProps {
  text: string;
  visible: boolean;
  position: { x: number; y: number };
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function TranslationTooltip({
  text,
  visible,
  position,
  onMouseEnter,
  onMouseLeave,
}: TranslationTooltipProps) {
  const { translation, isLoading, translate, clearTranslation } =
    useTranslator();
  const lastTextRef = useRef<string>('');

  useEffect(() => {
    if (visible && text && text !== lastTextRef.current) {
      lastTextRef.current = text;
      translate(text);
    } else if (!visible) {
      lastTextRef.current = '';
      clearTranslation();
    }
  }, [visible, text, translate, clearTranslation]);

  if (!visible) return null;

  const tooltipContent = (
    <div
      className={`translation-tooltip ${visible ? 'visible' : ''} ${isLoading ? 'loading' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translateY(calc(-100% - 8px))',
        maxWidth: '400px',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="translation-content">
        <span className="translation-text">
          {isLoading ? '' : translation || 'Translation unavailable'}
        </span>
      </div>
      <div className="translation-loading">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  );

  return createPortal(tooltipContent, document.body);
}
