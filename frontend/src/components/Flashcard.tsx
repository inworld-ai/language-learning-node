import { useState, useCallback } from 'react';
import type { Flashcard as FlashcardType } from '../types';

interface FlashcardProps {
  flashcard: FlashcardType;
  onCardClick?: (flashcard: FlashcardType) => void;
  onPronounce?: (flashcard: FlashcardType) => void;
  onPronounceText?: (text: string) => void;
  isPronouncing?: boolean;
  isPronouncingSentence?: boolean;
}

function capitalizeFirstLetter(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function Flashcard({
  flashcard,
  onCardClick,
  onPronounce,
  onPronounceText,
  isPronouncing = false,
  isPronouncingSentence = false,
}: FlashcardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  const handleClick = useCallback(() => {
    setIsFlipped((prev) => !prev);
    onCardClick?.(flashcard);
  }, [flashcard, onCardClick]);

  const handlePronounce = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onPronounce?.(flashcard);
    },
    [flashcard, onPronounce]
  );

  const handlePronounceExample = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const text = flashcard.example || flashcard.example_sentence || '';
      if (text && onPronounceText) {
        onPronounceText(text);
      }
    },
    [flashcard, onPronounceText]
  );

  // Support both new 'targetWord' and legacy 'spanish' field
  const targetWord =
    flashcard.targetWord || flashcard.spanish || flashcard.word || '';
  const english = flashcard.english || flashcard.translation || '';
  const example = flashcard.example || flashcard.example_sentence || '';
  const exampleTranslation = flashcard.exampleTranslation || '';
  const mnemonic = flashcard.mnemonic || '';
  const pinyin = flashcard.pinyin || '';
  const examplePinyin = flashcard.examplePinyin || '';

  // Capitalize the first letter of the target word for display
  const displayTargetWord = capitalizeFirstLetter(targetWord);

  return (
    <div
      className={`flashcard ${isFlipped ? 'flipped' : ''}`}
      onClick={handleClick}
    >
      <div className="flashcard-inner">
        <div className="flashcard-front">
          <div className="flashcard-target-word">{displayTargetWord}</div>
          {pinyin && <div className="flashcard-pinyin">{pinyin}</div>}
          <button
            className={`pronounce-button ${isPronouncing ? 'loading' : ''}`}
            onClick={handlePronounce}
            disabled={isPronouncing}
            aria-label="Pronounce word"
          >
            {isPronouncing ? (
              <svg
                className="pronounce-spinner"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
            )}
          </button>
        </div>
        <div className="flashcard-back">
          <div className="flashcard-english">{english}</div>
          <div
            className={`flashcard-example ${onPronounceText ? 'pronounceable' : ''} ${isPronouncingSentence ? 'pronouncing' : ''}`}
            onClick={onPronounceText ? handlePronounceExample : undefined}
            role={onPronounceText ? 'button' : undefined}
            aria-label={
              onPronounceText ? 'Pronounce example sentence' : undefined
            }
          >
            <span>{example}</span>
            {onPronounceText && (
              <svg
                className="example-speaker-icon"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
              </svg>
            )}
          </div>
          {examplePinyin && (
            <div className="flashcard-example-pinyin">{examplePinyin}</div>
          )}
          {exampleTranslation && (
            <div className="flashcard-example-translation">
              {exampleTranslation}
            </div>
          )}
          {mnemonic && (
            <div className="flashcard-mnemonic">
              <span className="mnemonic-label">Remember:</span>{' '}
              <span>{mnemonic}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
