import type { PetEvent } from '@2tamago/core';
import { Clock } from '../common/clock.js';
import { AnnouncementSender } from './announcement-sender.js';
import { plain } from './announcement-texts.js';
import { AnnouncementService, MAX_MESSAGES, WINDOW_MS } from './announcement.service.js';

class FakeSender extends AnnouncementSender {
  enabled = true;
  messages: string[] = [];
  override async send(text: string) {
    this.messages.push(text);
  }
}
class FakeClock extends Clock {
  time = 1_000_000;
  override now() {
    return this.time;
  }
}

function setup() {
  const sender = new FakeSender();
  const clock = new FakeClock();
  return { sender, clock, service: new AnnouncementService(sender, clock) };
}
const event = (type: PetEvent['type'], data?: PetEvent['data']): PetEvent => ({
  type,
  at: 0,
  data,
});
const pet = { petName: 'Pompon', ownerName: 'Ada', species: 'nyao', form: null } as const;

describe('AnnouncementService', () => {
  it('welcomes a new player', () => {
    const { sender, service } = setup();
    service.newPlayer('Ada');
    expect(sender.messages).toEqual(['👋 **Ada** vient de rejoindre 2Tamago ! Bienvenue !']);
  });

  it('announces a hatching with the species, and growth with the stage and form', () => {
    const { sender, service } = setup();
    service.petEvents(pet, [event('hatched')]);
    service.petEvents({ ...pet, form: 'radiant' }, [event('evolved', { to: 'adult' })]);
    service.petEvents(pet, [event('evolved', { to: 'child' })]);
    expect(sender.messages).toEqual([
      '🥚 **Pompon**, le compagnon de **Ada**, vient d’éclore ! (Nyao)',
      '✨ **Pompon**, le compagnon de **Ada**, a grandi : adulte, rayonnant.',
      '✨ **Pompon**, le compagnon de **Ada**, a grandi : enfant.',
    ]);
  });

  it('keeps everything else out of the channel', () => {
    const { sender, service } = setup();
    service.petEvents(pet, [
      event('pooped'),
      event('fell_ill'),
      event('departed'),
      event('retired'),
      event('care_mistake'),
      event('trick_level_up', { trick: 'sit', level: 1 }),
    ]);
    expect(sender.messages).toEqual([]);
  });

  it('announces the first meeting of two players', () => {
    const { sender, service } = setup();
    service.firstMeeting(
      { petName: 'Pompon', ownerName: 'Ada' },
      { petName: 'Caillou', ownerName: 'Bob' },
    );
    expect(sender.messages).toEqual([
      '🤝 **Pompon** (Ada) et **Caillou** (Bob) se sont croisés en promenade pour la première fois !',
    ]);
  });

  it('does nothing when no channel is configured', () => {
    const { sender, service } = setup();
    sender.enabled = false;
    service.newPlayer('Ada');
    service.petEvents(pet, [event('hatched')]);
    expect(sender.messages).toEqual([]);
  });

  it('drops messages beyond the limit, and resumes once the window has passed', () => {
    const { sender, clock, service } = setup();
    for (let i = 0; i < MAX_MESSAGES + 5; i++) service.newPlayer(`Joueur ${i}`);
    expect(sender.messages).toHaveLength(MAX_MESSAGES);
    clock.time += WINDOW_MS + 1;
    service.newPlayer('Retardataire');
    expect(sender.messages).toHaveLength(MAX_MESSAGES + 1);
    expect(sender.messages.at(-1)).toContain('Retardataire');
  });
});

describe('plain', () => {
  it('neutralizes markdown and mentions in a player name', () => {
    expect(plain('**gras** `code` ~~x~~ _i_')).toBe(
      '\\*\\*gras\\*\\* \\`code\\` \\~\\~x\\~\\~ \\_i\\_',
    );
    expect(plain('@everyone')).toBe('\\@everyone');
    expect(plain('<@123456>')).toBe('\\<\\@123456\\>');
    expect(plain('[lien](http://x)')).toBe('\\[lien\\]\\(http\\://x\\)');
  });

  it('shortens very long names and leaves ordinary ones alone', () => {
    expect(plain('x'.repeat(100))).toHaveLength(40);
    expect(plain('Ada Lovelace')).toBe('Ada Lovelace');
    expect(plain('Zoé-Léa 2')).toBe('Zoé-Léa 2');
  });
});
