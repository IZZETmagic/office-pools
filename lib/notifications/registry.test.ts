import { describe, it, expect } from 'vitest'
import { noticesForMember, poolGameMode, type GameMode, type RegistryRow } from './registry'

const row = (over: Partial<RegistryRow> & { type_key: string }): RegistryRow => ({
  category: 'PREDICTIONS',
  modes: null,
  channels: ['email', 'push'],
  is_transactional: false,
  status: 'live',
  disclosure_sentence: `A sentence for ${over.type_key}.`,
  ...over,
})

const modes = (...m: GameMode[]) => new Set<GameMode>(m)

describe('poolGameMode', () => {
  it('reads the league mode of a league pool', () => {
    expect(poolGameMode({ prediction_mode: 'league_pickem', league_mode: 'showdown' })).toBe('showdown')
  })
  it('reads the prediction mode of a tournament pool', () => {
    expect(poolGameMode({ prediction_mode: 'bracket_picker', league_mode: null })).toBe('bracket_picker')
  })
  it('gives a league pool with no league mode no mode at all', () => {
    expect(poolGameMode({ prediction_mode: 'league_pickem', league_mode: null })).toBeNull()
  })
  it('refuses a mode the registry does not know', () => {
    expect(poolGameMode({ prediction_mode: 'something_new', league_mode: null })).toBeNull()
  })
})

describe('noticesForMember', () => {
  it('shows only live kinds — never a planned or retired one', () => {
    const rows = [
      row({ type_key: 'matchweek_opened' }),
      row({ type_key: 'duel_drawn', status: 'planned' }),
      row({ type_key: 'lock_reminder', status: 'retired' }),
    ]
    expect(noticesForMember(rows, modes()).map((n) => n.key)).toEqual(['matchweek_opened'])
  })

  it('never shows a transactional kind — no switch controls it', () => {
    const rows = [row({ type_key: 'crew_invite' }), row({ type_key: 'crew_invite_email', is_transactional: true })]
    expect(noticesForMember(rows, modes()).map((n) => n.key)).toEqual(['crew_invite'])
  })

  it('shows a mode-tied kind only to someone playing that mode, and an untied one to everyone', () => {
    const rows = [
      row({ type_key: 'matchweek_opened', modes: ['pickem', 'showdown'] }),
      row({ type_key: 'level_up', modes: ['full_tournament'] }),
      row({ type_key: 'chat_mention', modes: null }),
    ]
    expect(noticesForMember(rows, modes('pickem')).map((n) => n.key)).toEqual(['matchweek_opened', 'chat_mention'])
    expect(noticesForMember(rows, modes()).map((n) => n.key)).toEqual(['chat_mention'])
  })

  it('orders them as the registry does, whatever order the database returns', () => {
    const rows = [row({ type_key: 'chat_mention' }), row({ type_key: 'lock_reminder' }), row({ type_key: 'matchweek_opened' })]
    expect(noticesForMember(rows, modes()).map((n) => n.key)).toEqual(['matchweek_opened', 'lock_reminder', 'chat_mention'])
  })

  it('puts a kind the code does not know last rather than dropping it', () => {
    const rows = [row({ type_key: 'not_in_code_yet' }), row({ type_key: 'matchweek_opened' })]
    expect(noticesForMember(rows, modes()).map((n) => n.key)).toEqual(['matchweek_opened', 'not_in_code_yet'])
  })

  it('carries the sentence word for word', () => {
    const sentence = 'If you haven\'t picked every match and the matchweek locks within 24 hours, we remind you once.'
    const [notice] = noticesForMember([row({ type_key: 'lock_reminder', disclosure_sentence: sentence })], modes())
    expect(notice).toEqual({ key: 'lock_reminder', category: 'PREDICTIONS', channels: ['email', 'push'], sentence })
  })
})
