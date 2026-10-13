import { Inject } from '../../base/decorators'
import { Workout } from '../base/model/Workout'
import { WorkoutGeneratorService } from './service'

describe('WorkoutGeneratorService', () => {
    let service: WorkoutGeneratorService
    let list

    beforeEach(() => {
        list = { addWorkout: jest.fn(), getStartSettings: jest.fn(() => ({ ftp: 275 })) }
        Inject('WorkoutList', list)
        service = new WorkoutGeneratorService()
    })

    afterEach(() => {
        Inject('WorkoutList', null)
    })

    test('provides the choices', () => {
        const options = service.getOptions()
        expect(options.durations).toEqual([30, 45, 60, 75, 90, 120])
        expect(options.energySystems.map(e => e.id)).toEqual(['aerobic', 'threshold', 'vo2max', 'anaerobic', 'neuromuscular', 'mixed'])
        expect(options.difficulties).toEqual([1, 2, 3, 4, 5])
        expect(options.concentrations).toEqual([1, 2, 3])
    })

    test('provides the FTP of the user', () => {
        expect(service.getFtp()).toBe(275)
    })

    test('generates a workout that can be ridden', () => {
        const generated = service.generate({ energy: 'vo2max', duration: 45, seed: 3 })

        expect(generated.workout).toBeInstanceOf(Workout)
        expect(generated.workout.name).toBe(generated.name)
        expect(generated.workout.duration).toBe(45 * 60)
    })

    test('saves a generated workout in My Workouts', () => {
        const generated = service.generate({ energy: 'threshold', duration: 60, seed: 3 })

        expect(service.save(generated)).toBe(true)
        expect(list.addWorkout).toHaveBeenCalledWith(generated.workout)
    })

    test('reports a failed save', () => {
        list.addWorkout.mockImplementation(() => { throw new Error('disk full') })
        const generated = service.generate({ seed: 3 })

        expect(service.save(generated)).toBe(false)
    })
})
