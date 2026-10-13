import type { StepDefinition } from '../base/model/types'
import type { EnergySystem, EnergySystemInfo, GeneratedSection, GeneratedWorkout, GeneratorOptions } from './types'

export const GENERATOR_DURATIONS = [30, 45, 60, 75, 90, 120]
export const GENERATOR_DIFFICULTIES = [1, 2, 3, 4, 5]
export const GENERATOR_CONCENTRATIONS = [1, 2, 3]

export const ENERGY_SYSTEMS: EnergySystemInfo[] = [
    { id: 'aerobic', label: 'Aerobic Base', subtitle: 'Endurance' },
    { id: 'threshold', label: 'Threshold', subtitle: 'Raise your FTP' },
    { id: 'vo2max', label: 'VO2max', subtitle: 'Maximum aerobic power' },
    { id: 'anaerobic', label: 'Anaerobic', subtitle: 'Short, hard efforts' },
    { id: 'neuromuscular', label: 'Neuromuscular', subtitle: 'Sprints' },
    { id: 'mixed', label: 'Mixed', subtitle: 'A bit of everything' },
]

type SingleSystem = Exclude<EnergySystem, 'mixed'>
type Range = [number, number]
type Structure = 'plain' | 'surges' | 'overunder' | 'micro' | 'ladder'

/**
 * Training profile of an energy system. Ranges are given as [easy, hard] and are
 * interpolated by difficulty.
 */
type Profile = {
    /** target power of an effort (% FTP) */
    power: Range
    /** duration of an effort (sec) */
    work: Range
    /** recovery time as multiple of the effort time */
    ratio: Range
    /** power during recovery (% FTP) */
    restPower: number
    /** maximum number of efforts - longer sessions are filled with endurance riding */
    maxEfforts: number
    /** structure of the efforts that need more concentration */
    structure: Structure
}

const PROFILES: Record<SingleSystem, Profile> = {
    aerobic: { power: [65, 78], work: [480, 1200], ratio: [0.25, 0.15], restPower: 55, maxEfforts: 6, structure: 'surges' },
    threshold: { power: [88, 102], work: [360, 1200], ratio: [0.5, 0.3], restPower: 52, maxEfforts: 5, structure: 'overunder' },
    vo2max: { power: [106, 120], work: [120, 300], ratio: [1.2, 0.8], restPower: 50, maxEfforts: 8, structure: 'micro' },
    anaerobic: { power: [120, 150], work: [40, 120], ratio: [3, 2], restPower: 48, maxEfforts: 10, structure: 'ladder' },
    neuromuscular: { power: [170, 250], work: [8, 20], ratio: [18, 10], restPower: 55, maxEfforts: 10, structure: 'ladder' },
}

const NAMES: Record<EnergySystem, string[]> = {
    aerobic: ['Long Road', 'Steady Engine', 'Diesel', 'Base Camp', 'Easy Miles', 'Tempo Valley'],
    threshold: ['Red Line', 'Ridge Line', 'Time Trial', 'Climb Clock', 'Sweet Ridge', 'Lactate Lane'],
    vo2max: ['Lung Burner', 'Summit Push', 'Ceiling', 'High Gear', 'Oxygen Debt', 'Big Hill'],
    anaerobic: ['Short Fuse', 'Kick Start', 'Hill Attack', 'Burn Box', 'Breakaway', 'Punch Card'],
    neuromuscular: ['Lightning', 'Spark Plug', 'Jump Start', 'Rocket', 'Launch Pad', 'Sprint Line'],
    mixed: ['Mixed Bag', 'Full Menu', 'Cocktail', 'Grab Bag', 'Everything', 'Kitchen Sink'],
}

const FOCUS: Record<EnergySystem, string> = {
    aerobic: 'Ride smooth and relaxed. This builds the aerobic base that every other effort depends on.',
    threshold: 'Hold a hard but steady pace. This raises the power you can sustain for a long time (FTP).',
    vo2max: 'Breathe deep and stay on top of the gear. This raises your maximum aerobic power.',
    anaerobic: 'Go hard from the first pedal stroke and recover fully. This improves efforts of 30 seconds to 2 minutes.',
    neuromuscular: 'Sprint all out, then rest well. This trains top speed and fast pedalling.',
    mixed: 'Different efforts in one session. This keeps all energy systems sharp.',
}

const WARMUP_START = 45
const COOLDOWN_START = 55
const COOLDOWN_END = 40
const MIXED_RECOVERY = 240
const MIXED_RECOVERY_POWER = 50

/**
 * Small, fast seeded random generator (mulberry32) - the same seed always creates the same sequence
 */
export const createRandom = (seed: number): (() => number) => {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6D2B79F5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)
const lerp = ([a, b]: Range, t: number) => a + (b - a) * t
const roundTo = (v: number, step: number) => Math.round(v / step) * step

/**
 * Formats a duration: 45s, 13m, 1m43s
 */
export const formatDuration = (sec: number): string => {
    const m = Math.floor(sec / 60)
    const s = Math.round(sec % 60)
    if (m === 0) return `${s}s`
    if (s === 0) return `${m}m`
    return `${m}m${s.toString().padStart(2, '0')}s`
}

class StepList {
    steps: StepDefinition[] = []

    add(duration: number, power: number, props: { to?: number, work?: boolean, text?: string } = {}) {
        if (duration <= 0)
            return
        const { to, work = false, text } = props
        const from = Math.round(power)
        const target = to === undefined ? from : Math.round(to)
        const step: StepDefinition = { type: 'step', duration: Math.round(duration), work, text }

        if (target === from) {
            step.power = { min: from, max: from, type: 'pct of FTP' }
            step.steady = true
        }
        else if (target > from) {
            step.power = { min: from, max: target, type: 'pct of FTP' }
            step.steady = false
        }
        else {
            step.power = { min: target, max: from, type: 'pct of FTP' }
            step.steady = false
            step.cooldown = true
        }
        this.steps.push(step)
    }
}

type SetResult = { lines: string[], efforts: number, peak: number, leftover: number }

/**
 * Splits the total work time into a pyramid of efforts (short - long - short) with the same total
 */
const getLadder = (efforts: number, work: number): number[] => {
    if (efforts < 3)
        return new Array(efforts).fill(work)
    const mid = (efforts - 1) / 2
    const factors = Array.from({ length: efforts }, (_, i) => 0.7 + 0.6 * (1 - Math.abs(i - mid) / mid))
    const mean = factors.reduce((a, b) => a + b, 0) / efforts
    const works = factors.map(f => Math.round(work * f / mean))
    works[efforts - 1] += efforts * work - works.reduce((a, b) => a + b, 0)
    return works
}

/**
 * Builds the main set for one energy system and fills exactly `sec` seconds (except a few seconds of rounding, returned as leftover)
 */
const buildSet = (energy: SingleSystem, sec: number, t: number, concentration: number, rnd: () => number, list: StepList): SetResult => {
    const p = PROFILES[energy]
    const jitter = (amount: number) => 1 + (rnd() - 0.5) * amount

    const power = Math.round(lerp(p.power, t) * jitter(0.04))

    // simple, steady endurance ride
    if (energy === 'aerobic' && concentration === 1) {
        list.add(sec, power, { work: true })
        return { lines: [`${formatDuration(sec)} ${power}%`], efforts: 1, peak: power, leftover: 0 }
    }

    const concentrationFactor = [1.3, 1, 0.8][concentration - 1]
    const k = lerp(p.ratio, t) * jitter(0.15)
    let work = clamp(lerp(p.work, t) * concentrationFactor * jitter(0.15), p.work[0] * 0.7, p.work[1] * 1.3)
    work = Math.min(work, sec)

    let efforts = clamp(Math.round((sec + work * k) / (work * (1 + k))), 1, p.maxEfforts)

    // too much time for the maximum number of efforts: the rest becomes endurance riding
    let setSec = sec
    let endurance = 0
    const needed = efforts * work + (efforts - 1) * work * k
    if (efforts === p.maxEfforts && needed < sec - 120) {
        setSec = Math.round(needed)
        endurance = sec - setSec
    }

    // stretch work and rest a little, so that the efforts fill the set exactly
    const n = efforts - 1
    const workSec = n > 0 ? Math.round(setSec / (n * (1 + k) + 1)) : setSec
    const restSec = n > 0 ? Math.floor((setSec - efforts * workSec) / n) : 0
    const leftover = setSec - efforts * workSec - n * restSec
    const restPower = p.restPower

    const structure: Structure = concentration === 3 ? p.structure : 'plain'
    const works = structure === 'ladder' ? getLadder(efforts, workSec) : new Array(efforts).fill(workSec)
    let peak = power

    const addWork = (d: number) => {
        switch (structure) {
            case 'surges': {
                const surge = power + 35
                peak = Math.max(peak, surge)
                let remaining = d
                while (remaining > 270) {
                    list.add(240, power, { work: true })
                    list.add(30, surge, { work: true, text: 'Surge' })
                    remaining -= 270
                }
                list.add(remaining, power, { work: true })
                break
            }
            case 'overunder': {
                const under = power - 5
                const over = power + 8
                peak = Math.max(peak, over)
                let remaining = d
                while (remaining >= 180) {
                    list.add(120, under, { work: true, text: 'Under' })
                    list.add(60, over, { work: true, text: 'Over' })
                    remaining -= 180
                }
                list.add(remaining, under, { work: true, text: 'Under' })
                break
            }
            case 'micro': {
                const on = power + 10
                peak = Math.max(peak, on)
                let remaining = d
                while (remaining >= 45) {
                    list.add(30, on, { work: true })
                    list.add(15, 50, { work: false })
                    remaining -= 45
                }
                list.add(remaining, power, { work: true })
                break
            }
            default:
                list.add(d, power, { work: true })
        }
    }

    works.forEach((d, i) => {
        addWork(d)
        if (i < n)
            list.add(restSec, restPower, { text: 'Recover' })
    })

    const lines: string[] = []
    const recover = `recover ${formatDuration(restSec)} at ${restPower}% between efforts`
    switch (structure) {
        case 'surges':
            lines.push(`${efforts}x ${formatDuration(workSec)} ${power}% with 30s surges at ${power + 35}% every 4m`)
            if (n > 0) lines.push(recover)
            break
        case 'overunder':
            lines.push(`${efforts}x ${formatDuration(workSec)} over-unders: 2m ${power - 5}% / 1m ${power + 8}%`)
            if (n > 0) lines.push(recover)
            break
        case 'micro':
            lines.push(`${efforts}x ${formatDuration(workSec)} of 30s ${power + 10}% / 15s 50%`)
            if (n > 0) lines.push(recover)
            break
        case 'ladder':
            lines.push(`${efforts} efforts at ${power}%: ${works.map(formatDuration).join(', ')}`)
            if (n > 0) lines.push(recover)
            break
        default:
            if (n === 1)
                lines.push(`${formatDuration(workSec)} ${power}%`, `${formatDuration(restSec)} ${restPower}%`)
            else if (n > 1)
                lines.push(`${n}x ${formatDuration(workSec)} ${power}% / ${formatDuration(restSec)} ${restPower}%`)
            lines.push(`${formatDuration(workSec)} ${power}%`)
    }

    if (endurance > 0) {
        const endurancePower = Math.round(lerp([60, 68], t))
        list.add(endurance + leftover, endurancePower, { text: 'Endurance' })
        lines.push(`${formatDuration(endurance + leftover)} endurance ${endurancePower}%`)
        return { lines, efforts, peak, leftover: 0 }
    }

    return { lines, efforts, peak, leftover }
}

/**
 * Estimated Training Stress Score of a list of steps (power given in % of FTP)
 */
export const calculateTss = (steps: StepDefinition[]): number => {
    const sum = steps.reduce((total, s) => {
        const a = (s.power?.min ?? 0) / 100
        const b = (s.power?.max ?? 0) / 100
        const intensity = s.steady === false ? (a * a + a * b + b * b) / 3 : b * b
        return total + (s.duration ?? 0) * intensity
    }, 0)
    return Math.round(sum / 3600 * 100)
}

/**
 * Creates a workout from the given options. Options that are not set are chosen randomly.
 */
export const generateWorkout = (options: GeneratorOptions = {}): GeneratedWorkout => {
    const seed = options.seed ?? Math.floor(Math.random() * 0x7fffffff)
    const rnd = createRandom(seed)
    const pick = <T>(list: T[]): T => list[Math.floor(rnd() * list.length)]

    const minutes = Math.round(clamp(options.duration ?? pick(GENERATOR_DURATIONS), 20, 240))
    const energy: EnergySystem = options.energy ?? pick(ENERGY_SYSTEMS).id
    const difficulty = Math.round(clamp(options.difficulty ?? pick(GENERATOR_DIFFICULTIES), 1, 5))
    const concentration = Math.round(clamp(options.concentration ?? pick(GENERATOR_CONCENTRATIONS), 1, 3))
    const t = (difficulty - 1) / 4

    const total = minutes * 60
    const warmup = clamp(roundTo(total * (0.12 + rnd() * 0.08), 60), 300, 900)
    let cooldown = clamp(roundTo(total * (0.08 + rnd() * 0.06), 60), 300, 600)
    const main = total - warmup - cooldown

    const mainList = new StepList()
    let mainLines: string[]
    let efforts: number
    let peak: number
    let leftover: number
    let description: string

    if (energy === 'mixed') {
        const first: SingleSystem = pick(['threshold', 'vo2max'] as SingleSystem[])
        const second: SingleSystem = pick(['anaerobic', 'neuromuscular'] as SingleSystem[])
        const firstSec = Math.round((main - MIXED_RECOVERY) * 0.55)
        const secondSec = main - MIXED_RECOVERY - firstSec
        const label = (id: SingleSystem) => ENERGY_SYSTEMS.find(e => e.id === id)?.label

        const a = buildSet(first, firstSec, t, concentration, rnd, mainList)
        mainList.add(MIXED_RECOVERY + a.leftover, MIXED_RECOVERY_POWER, { text: 'Recover' })
        const b = buildSet(second, secondSec, t, concentration, rnd, mainList)

        mainLines = [
            `${label(first)}:`, ...a.lines.map(l => `  ${l}`),
            `${formatDuration(MIXED_RECOVERY + a.leftover)} recovery ${MIXED_RECOVERY_POWER}%`,
            `${label(second)}:`, ...b.lines.map(l => `  ${l}`),
        ]
        efforts = a.efforts + b.efforts
        peak = Math.max(a.peak, b.peak)
        leftover = b.leftover
        description = `${label(first)} and ${label(second)} in ${minutes} minutes, peaking at ${peak}%. ${FOCUS.mixed}`
    }
    else {
        const res = buildSet(energy, main, t, concentration, rnd, mainList)
        mainLines = res.lines
        efforts = res.efforts
        peak = res.peak
        leftover = res.leftover
        const count = efforts === 1 ? 'One effort' : `${efforts} efforts`
        description = `${count} peaking at ${peak}% in ${minutes} minutes. ${FOCUS[energy]}`
    }

    cooldown += leftover
    const warmupTop = energy === 'aerobic' ? 65 : 75

    const list = new StepList()
    list.add(warmup, WARMUP_START, { to: warmupTop, text: 'Warmup' })
    list.steps.push(...mainList.steps)
    list.add(cooldown, COOLDOWN_START, { to: COOLDOWN_END, text: 'Cooldown' })

    const details: GeneratedSection[] = [
        { title: 'Warmup', lines: [`${formatDuration(warmup)} ramp ${WARMUP_START}-${warmupTop}%`] },
        { title: 'Main Set', lines: mainLines },
        { title: 'Cooldown', lines: [`${formatDuration(cooldown)} ramp ${COOLDOWN_START}-${COOLDOWN_END}%`] },
    ]

    return {
        name: pick(NAMES[energy]),
        description,
        energy,
        difficulty,
        concentration,
        duration: total,
        tss: calculateTss(list.steps),
        peak,
        details,
        steps: list.steps,
        seed,
    }
}
