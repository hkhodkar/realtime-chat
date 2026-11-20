import { isJumboEmoji, linkify } from './linkify';

describe('linkify', () => {
  it('splits links out of text without trailing punctuation', () => {
    expect(linkify('Docs: https://example.com/a?b=1. Thanks!')).toEqual([
      { text: 'Docs: ' },
      { text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
      { text: '. Thanks!' },
    ]);
  });

  it('leaves plain text and fake links alone', () => {
    expect(linkify('javascript:alert(1) is not a link')).toEqual([
      { text: 'javascript:alert(1) is not a link' },
    ]);
  });
});

describe('isJumboEmoji', () => {
  it('is true for up to three emoji only', () => {
    expect(isJumboEmoji('🎉')).toBe(true);
    expect(isJumboEmoji('👍🏽 ❤️')).toBe(true);
    expect(isJumboEmoji('👨‍👩‍👧')).toBe(true);
    expect(isJumboEmoji('🎉🎉🎉🎉')).toBe(false);
    expect(isJumboEmoji('nice 🎉')).toBe(false);
    expect(isJumboEmoji('123')).toBe(false);
  });
});
