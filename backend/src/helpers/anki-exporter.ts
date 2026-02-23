// @ts-expect-error - no type definitions available for anki-apkg-export
import AnkiExport from 'anki-apkg-export';
import { Flashcard } from './flashcard-processor.js';
import { GeneratedAudio } from './tts-audio-generator.js';
import { GeneratedImage } from './image-generator.js';

export class AnkiExporter {
  /**
   * Export flashcards to ANKI .apkg format
   * @param audioMap - Optional map from targetWord to generated audio file info.
   * @param imageMap - Optional map from targetWord to generated image file info.
   */
  async exportFlashcards(
    flashcards: Flashcard[],
    deckName: string = 'Inworld Language Tutor Cards',
    audioMap?: Map<string, GeneratedAudio>,
    imageMap?: Map<string, GeneratedImage>
  ): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apkg = new (AnkiExport as any).default(deckName);

    if (audioMap) {
      for (const [, audio] of audioMap) {
        apkg.addMedia(audio.filename, audio.buffer);
      }
    }

    if (imageMap) {
      for (const [, image] of imageMap) {
        apkg.addMedia(image.filename, image.buffer);
      }
    }

    flashcards.forEach((flashcard) => {
      // @deprecated Legacy 'spanish' field support
      const targetWord =
        flashcard.targetWord || (flashcard as { spanish?: string }).spanish;

      if (
        !targetWord ||
        !flashcard.english ||
        targetWord.trim() === '' ||
        flashcard.english.trim() === ''
      ) {
        return;
      }

      const front = this.formatCardFront(
        flashcard,
        targetWord.trim(),
        audioMap
      );
      const back = this.formatCardBack(flashcard, audioMap, imageMap);

      const tags = ['inworld-language-tutor'];

      if (flashcard.languageCode) {
        tags.push(`language-${flashcard.languageCode}`);
      }

      if (flashcard.timestamp) {
        const date = new Date(flashcard.timestamp).toISOString().split('T')[0];
        tags.push(`created-${date}`);
      }

      apkg.addCard(front, back, { tags });
    });

    const zipBuffer = await apkg.save();
    return zipBuffer;
  }

  /**
   * Format the front of the card (target word + pinyin + audio)
   */
  private formatCardFront(
    flashcard: Flashcard,
    targetWord: string,
    audioMap?: Map<string, GeneratedAudio>
  ): string {
    const audio = audioMap?.get(targetWord);

    let html = `<div style="font-family: 'Noto Sans', 'Noto Sans SC', 'Noto Sans JP', 'Helvetica Neue', Arial, sans-serif; text-align: center; padding: 20px;">`;

    html += `<div style="font-size: 42px; font-weight: 700; color: #1a1a2e; margin-bottom: 8px; line-height: 1.3;">${this.escapeHtml(targetWord)}</div>`;

    if (flashcard.pinyin) {
      html += `<div style="font-size: 18px; color: #6c757d; margin-bottom: 16px; letter-spacing: 0.5px; font-style: italic;">${this.escapeHtml(flashcard.pinyin)}</div>`;
    }

    if (audio) {
      html += `<div style="margin: 12px 0;">[sound:${audio.filename}]</div>`;
    }

    html += `</div>`;
    return html;
  }

  /**
   * Format the back of the card with English, example, and mnemonic
   */
  private formatCardBack(
    flashcard: Flashcard,
    audioMap?: Map<string, GeneratedAudio>,
    imageMap?: Map<string, GeneratedImage>
  ): string {
    const targetWord = (
      flashcard.targetWord ||
      (flashcard as { spanish?: string }).spanish ||
      ''
    ).trim();

    let html = `<div style="font-family: 'Noto Sans', 'Noto Sans SC', 'Noto Sans JP', 'Helvetica Neue', Arial, sans-serif; text-align: center; padding: 20px; max-width: 480px; margin: 0 auto;">`;

    html += `<div style="font-size: 26px; font-weight: 600; color: #1a1a2e; margin-bottom: 20px; line-height: 1.4;">${this.escapeHtml(flashcard.english)}</div>`;

    html += `<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 0 0 20px 0;">`;

    if (flashcard.example && flashcard.example.trim()) {
      const sentenceAudio = audioMap?.get(flashcard.example.trim());

      html += `<div style="background: linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%); border-radius: 12px; padding: 16px 20px; margin-bottom: 16px; border-left: 4px solid #4a6cf7; text-align: left;">`;

      html += `<div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">`;
      html += `<div style="flex: 1;">`;
      html += `<div style="font-size: 17px; color: #2d3748; line-height: 1.6;">${this.escapeHtml(flashcard.example)}</div>`;
      if (flashcard.examplePinyin) {
        html += `<div style="font-size: 13px; color: #8e99a4; margin-top: 2px; font-style: italic;">${this.escapeHtml(flashcard.examplePinyin)}</div>`;
      }
      html += `</div>`;
      if (sentenceAudio) {
        html += `<div style="flex-shrink: 0; padding-top: 2px;">[sound:${sentenceAudio.filename}]</div>`;
      }
      html += `</div>`;

      if (flashcard.exampleTranslation && flashcard.exampleTranslation.trim()) {
        html += `<div style="font-size: 14px; color: #718096; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(74, 108, 247, 0.15);">${this.escapeHtml(flashcard.exampleTranslation)}</div>`;
      }

      html += `</div>`;
    }

    const image = imageMap?.get(targetWord);
    if (image) {
      html += `<div style="margin: 16px auto; max-width: 320px;"><img src="${image.filename}" style="width: 100%; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);"></div>`;
    }

    if (flashcard.mnemonic && flashcard.mnemonic.trim()) {
      html += `<div style="background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border-radius: 12px; padding: 14px 18px; text-align: left; border-left: 4px solid #22c55e;">`;
      html += `<div style="font-size: 12px; font-weight: 700; color: #16a34a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Remember</div>`;
      html += `<div style="font-size: 14px; color: #334155; line-height: 1.5;">${this.escapeHtml(flashcard.mnemonic)}</div>`;
      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  countValidFlashcards(flashcards: Flashcard[]): number {
    return flashcards.filter((flashcard) => {
      const targetWord =
        flashcard.targetWord || (flashcard as { spanish?: string }).spanish;
      return (
        targetWord &&
        flashcard.english &&
        targetWord.trim() !== '' &&
        flashcard.english.trim() !== ''
      );
    }).length;
  }
}
