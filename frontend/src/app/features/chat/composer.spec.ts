import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Composer } from './composer';

describe('Composer', () => {
  let fixture: ComponentFixture<Composer>;
  let sent: string[];
  let typing: number;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Composer);
    fixture.componentRef.setInput('roomName', 'general');
    sent = [];
    typing = 0;
    fixture.componentInstance.send.subscribe((body) => sent.push(body));
    fixture.componentInstance.typing.subscribe(() => typing++);
    await fixture.whenStable();
  });

  const textarea = () => fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
  const sendButton = () => fixture.nativeElement.querySelector('.send') as HTMLButtonElement;

  async function type(value: string) {
    textarea().value = value;
    textarea().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  function press(key: string, init: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
    textarea().dispatchEvent(event);
    return event;
  }

  it('shows the room in the placeholder', () => {
    expect(textarea().placeholder).toBe('Message #general');
  });

  it('sends on Enter and clears the box', async () => {
    await type('  Hello 👋  ');
    expect(typing).toBe(1);

    const event = press('Enter');
    await fixture.whenStable();

    expect(event.defaultPrevented).toBe(true);
    expect(sent).toEqual(['Hello 👋']);
    expect(textarea().value).toBe('');
  });

  it('keeps Shift+Enter as a new line', async () => {
    await type('line one');
    const event = press('Enter', { shiftKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(sent).toEqual([]);
  });

  it('does not send empty messages', async () => {
    await type('   ');
    press('Enter');
    expect(sent).toEqual([]);
    expect(sendButton().disabled).toBe(true);
  });

  it('enforces the character limit with a counter', async () => {
    await type('a'.repeat(900));
    expect(fixture.nativeElement.querySelector('.counter')?.textContent).toContain('900 / 1000');

    await type('a'.repeat(1001));
    expect(fixture.nativeElement.querySelector('.counter.over')).not.toBeNull();
    expect(sendButton().disabled).toBe(true);
    press('Enter');
    expect(sent).toEqual([]);
  });

  it('keeps the draft while disconnected', async () => {
    fixture.componentRef.setInput('status', 'reconnecting');
    await type('still here');
    press('Enter');
    expect(sent).toEqual([]);
    expect(textarea().value).toBe('still here');
    expect(textarea().placeholder).toContain('Reconnecting');
  });

  it('inserts emoji at the cursor', async () => {
    await type('Ship it');
    textarea().setSelectionRange(4, 4);
    (fixture.nativeElement.querySelector('.picker-wrap .icon-btn') as HTMLButtonElement).click();
    await fixture.whenStable();
    const buttons = [
      ...fixture.nativeElement.querySelectorAll('.picker button'),
    ] as HTMLButtonElement[];
    buttons.find((button) => button.textContent?.trim() === '🚀')!.click();
    await fixture.whenStable();
    expect(textarea().value).toBe('Ship🚀 it');
  });
});
