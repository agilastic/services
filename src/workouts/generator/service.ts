import { Injectable } from '../../base/decorators'
import { IncyclistService } from '../../base/service'
import { Singleton } from '../../base/types'
import { Workout } from '../base/model/Workout'
import { useWorkoutList } from '../list'
import { ENERGY_SYSTEMS, GENERATOR_CONCENTRATIONS, GENERATOR_DIFFICULTIES, GENERATOR_DURATIONS, generateWorkout } from './builder'
import type { GeneratedWorkout, GeneratorOptions, GeneratorOptionsInfo } from './types'

/**
 * Workout Generator
 *
 * Creates structured workouts from a few choices (duration, energy system, difficulty, concentration).
 * Everything is calculated locally - no server is needed.
 */
@Singleton
export class WorkoutGeneratorService extends IncyclistService {

    constructor() {
        super('WorkoutGenerator')
    }

    /**
     * Provides the choices the user can make
     */
    getOptions(): GeneratorOptionsInfo {
        return {
            durations: [...GENERATOR_DURATIONS],
            energySystems: ENERGY_SYSTEMS.map(e => ({ ...e })),
            difficulties: [...GENERATOR_DIFFICULTIES],
            concentrations: [...GENERATOR_CONCENTRATIONS],
        }
    }

    /**
     * Provides the user's FTP (used to show watts)
     */
    getFtp(): number {
        try {
            return this.getWorkoutList().getStartSettings()?.ftp ?? 200
        }
        catch {
            return 200
        }
    }

    /**
     * Generates a new workout. Options that are not set are chosen randomly.
     *
     * @param options choices of the user
     * @returns the generated workout, or undefined if it could not be created
     */
    generate(options: GeneratorOptions = {}): GeneratedWorkout | undefined {
        try {
            const generated = generateWorkout(options)
            generated.workout = this.createWorkout(generated)
            this.logEvent({ message: 'workout generated', energy: generated.energy, difficulty: generated.difficulty, concentration: generated.concentration, duration: generated.duration })
            return generated
        }
        catch (err) {
            this.logError(err as Error, 'generate', options)
            return undefined
        }
    }

    /**
     * Saves a generated workout in "My Workouts"
     *
     * @returns true if the workout was saved
     */
    save(generated: GeneratedWorkout): boolean {
        try {
            const workout = generated.workout ?? this.createWorkout(generated)
            this.getWorkoutList().addWorkout(workout)
            this.logEvent({ message: 'generated workout saved', energy: generated.energy })
            return true
        }
        catch (err) {
            this.logError(err as Error, 'save')
            return false
        }
    }

    protected createWorkout(generated: GeneratedWorkout): Workout {
        const { name, description, steps } = generated
        return new Workout({ type: 'workout', name, description, steps: steps.map(s => ({ ...s, power: { ...s.power } })) })
    }

    @Injectable
    protected getWorkoutList() {
        return useWorkoutList()
    }
}

/**
 * Provides the Workout Generator service
 */
export const useWorkoutGenerator = () => new WorkoutGeneratorService()
