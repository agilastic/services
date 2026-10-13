import { calculateTss, createRandom, formatDuration, generateWorkout, ENERGY_SYSTEMS, GENERATOR_DURATIONS } from './builder'
import type { EnergySystem } from './types'

const totalDuration = (steps) => steps.reduce((sum, s) => sum + s.duration, 0)
const maxPower = (steps) => Math.max(...steps.map(s => s.power.max))
const energies = ENERGY_SYSTEMS.map(e => e.id) as EnergySystem[]

describe('Workout Generator', () => {

    describe('formatDuration', () => {
        test('seconds, minutes and both', () => {
            expect(formatDuration(45)).toBe('45s')
            expect(formatDuration(780)).toBe('13m')
            expect(formatDuration(103)).toBe('1m43s')
            expect(formatDuration(246)).toBe('4m06s')
        })
    })

    describe('createRandom', () => {
        test('the same seed creates the same numbers', () => {
            const a = createRandom(42)
            const b = createRandom(42)
            expect([a(), a(), a()]).toEqual([b(), b(), b()])
        })

        test('numbers are between 0 and 1', () => {
            const r = createRandom(1)
            for (let i = 0; i < 1000; i++) {
                const v = r()
                expect(v).toBeGreaterThanOrEqual(0)
                expect(v).toBeLessThan(1)
            }
        })
    })

    describe('calculateTss', () => {
        test('one hour at FTP is 100', () => {
            expect(calculateTss([{ duration: 3600, steady: true, power: { min: 100, max: 100 } }])).toBe(100)
        })

        test('ramps use the average intensity', () => {
            const ramp = calculateTss([{ duration: 3600, steady: false, power: { min: 50, max: 100 } }])
            expect(ramp).toBe(58)
        })
    })

    describe('generateWorkout', () => {
        test('the total duration is exact for all combinations', () => {
            for (const energy of energies)
                for (const duration of GENERATOR_DURATIONS)
                    for (const difficulty of [1, 3, 5])
                        for (const concentration of [1, 2, 3])
                            for (const seed of [1, 2, 3]) {
                                const w = generateWorkout({ energy, duration, difficulty, concentration, seed })
                                expect(totalDuration(w.steps)).toBe(duration * 60)
                                expect(w.duration).toBe(duration * 60)
                                w.steps.forEach(s => {
                                    expect(s.duration).toBeGreaterThan(0)
                                    expect(s.power.min).toBeLessThanOrEqual(s.power.max)
                                })
                            }
        })

        test('the same options and seed create the same workout', () => {
            const a = generateWorkout({ energy: 'vo2max', duration: 60, difficulty: 3, concentration: 2, seed: 7 })
            const b = generateWorkout({ energy: 'vo2max', duration: 60, difficulty: 3, concentration: 2, seed: 7 })
            expect(a).toEqual(b)
        })

        test('another seed creates another workout', () => {
            const a = generateWorkout({ energy: 'threshold', duration: 60, seed: 1 })
            const b = generateWorkout({ energy: 'threshold', duration: 60, seed: 2 })
            expect(a.steps).not.toEqual(b.steps)
        })

        test('random choices when options are not set', () => {
            const w = generateWorkout({ seed: 5 })
            expect(GENERATOR_DURATIONS).toContain(w.duration / 60)
            expect(energies).toContain(w.energy)
            expect(w.difficulty).toBeGreaterThanOrEqual(1)
            expect(w.difficulty).toBeLessThanOrEqual(5)
            expect(w.concentration).toBeGreaterThanOrEqual(1)
            expect(w.concentration).toBeLessThanOrEqual(3)
        })

        test.each([
            ['aerobic', 60, 85],
            ['threshold', 85, 115],
            ['vo2max', 100, 135],
            ['anaerobic', 115, 165],
            ['neuromuscular', 160, 265],
        ])('%s efforts are in the right power range', (energy, min, max) => {
            for (const seed of [1, 2, 3, 4]) {
                const w = generateWorkout({ energy: energy as EnergySystem, duration: 60, concentration: 2, seed })
                const work = w.steps.filter(s => s.work)
                work.forEach(s => {
                    expect(s.power.max).toBeGreaterThanOrEqual(min)
                    expect(s.power.max).toBeLessThanOrEqual(max)
                })
                expect(w.peak).toBe(maxPower(work))
            }
        })

        test('a harder workout has a higher TSS', () => {
            for (const energy of energies) {
                const easy = generateWorkout({ energy, duration: 60, difficulty: 1, concentration: 2, seed: 3 })
                const hard = generateWorkout({ energy, duration: 60, difficulty: 5, concentration: 2, seed: 3 })
                expect(hard.tss).toBeGreaterThan(easy.tss)
            }
        })

        test('starts with a warmup ramp and ends with a cooldown ramp', () => {
            const w = generateWorkout({ energy: 'anaerobic', duration: 45, seed: 9 })
            const first = w.steps[0]
            const last = w.steps[w.steps.length - 1]
            expect(first).toMatchObject({ steady: false, power: { min: 45, max: 75 } })
            expect(last).toMatchObject({ steady: false, cooldown: true, power: { min: 40, max: 55 } })
            expect(w.details.map(d => d.title)).toEqual(['Warmup', 'Main Set', 'Cooldown'])
        })

        test('simple aerobic ride is one steady block', () => {
            const w = generateWorkout({ energy: 'aerobic', duration: 90, concentration: 1, seed: 4 })
            expect(w.steps.filter(s => s.work)).toHaveLength(1)
            expect(w.description).toMatch(/^One effort/)
        })

        test('long sprint sessions are filled with endurance riding', () => {
            const w = generateWorkout({ energy: 'neuromuscular', duration: 120, concentration: 2, seed: 4 })
            expect(w.steps.filter(s => s.work).length).toBeLessThanOrEqual(10)
            expect(w.steps.some(s => s.text === 'Endurance')).toBe(true)
        })

        test('more concentration means more changes', () => {
            const simple = generateWorkout({ energy: 'threshold', duration: 60, concentration: 1, seed: 2 })
            const focus = generateWorkout({ energy: 'threshold', duration: 60, concentration: 3, seed: 2 })
            expect(focus.steps.length).toBeGreaterThan(simple.steps.length)
            expect(focus.details[1].lines[0]).toMatch(/over-unders/)
        })

        test('mixed workouts combine two energy systems', () => {
            const w = generateWorkout({ energy: 'mixed', duration: 75, seed: 6 })
            const titles = w.details[1].lines.filter(l => l.endsWith(':'))
            expect(titles).toHaveLength(2)
            expect(w.name).toBeTruthy()
        })

        test('two efforts are listed step by step', () => {
            const w = generateWorkout({ energy: 'aerobic', duration: 60, difficulty: 5, concentration: 2, seed: 2 })
            const work = w.steps.filter(s => s.work)
            if (work.length === 2)
                expect(w.details[1].lines).toHaveLength(3)
            w.details[1].lines.forEach(l => expect(l).not.toMatch(/^1x /))
        })

        test('describes the workout', () => {
            const w = generateWorkout({ energy: 'anaerobic', duration: 45, difficulty: 3, concentration: 2, seed: 1 })
            expect(w.description).toContain('in 45 minutes')
            expect(w.description).toContain(`${w.peak}%`)
        })
    })
})
