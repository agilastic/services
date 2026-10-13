import type { StepDefinition } from '../base/model/types'
import type { Workout } from '../base/model/Workout'

export type EnergySystem = 'aerobic' | 'threshold' | 'vo2max' | 'anaerobic' | 'neuromuscular' | 'mixed'

export type GeneratorOptions = {
    /** total duration in minutes - random if not set */
    duration?: number
    /** energy system to be trained - random if not set */
    energy?: EnergySystem
    /** 1 (easy) .. 5 (very hard) - random if not set */
    difficulty?: number
    /** 1 (simple, few changes) .. 3 (many changes, needs focus) - random if not set */
    concentration?: number
    /** seed of the random generator - the same options and seed always create the same workout */
    seed?: number
}

export type GeneratedSection = {
    title: 'Warmup' | 'Main Set' | 'Cooldown'
    lines: string[]
}

export type GeneratedWorkout = {
    name: string
    description: string
    energy: EnergySystem
    difficulty: number
    concentration: number
    /** total duration in seconds */
    duration: number
    /** estimated Training Stress Score */
    tss: number
    /** highest target power in % of FTP */
    peak: number
    /** human readable structure */
    details: GeneratedSection[]
    steps: StepDefinition[]
    seed: number
    /** the workout, ready to be shown in a graph, ridden or saved */
    workout?: Workout
}

export type EnergySystemInfo = {
    id: EnergySystem
    label: string
    subtitle: string
}

export type GeneratorOptionsInfo = {
    durations: number[]
    energySystems: EnergySystemInfo[]
    difficulties: number[]
    concentrations: number[]
}
