import {IncyclistWorkoutsApi} from '../../base/api'
import { Plan, Workout } from '../../base/model/Workout'
import {WorkoutsApiLoader} from './api'


const testData = [
    { id:'1',type:'workout', name:'1', steps:[ ], repeat:1},
    { id:'2',type:'workout', name:'2', steps:[ ], repeat:1},
    { id:'3',type:'plan', name:'plan', workouts:[ 
        {week:1, day:1, workout:'1'},
        {week:2, day:1, workout:'1'}
    ]},
]

describe('WorkoutsApiLoader',()=>{

    describe('load',()=>{


        const waitForDone = (observer) => new Promise<boolean>( done => {
            const timeout = setTimeout( ()=>done(false), 1000)
            observer.on('done', ()=>{ clearTimeout(timeout); done(true) })
        })

        test('reports done when the workout server can not be reached',async ()=>{
            const api = new IncyclistWorkoutsApi()
            api.getWorkouts = jest.fn().mockResolvedValue(undefined)

            const loader = new WorkoutsApiLoader()
            const added = jest.fn()
            const observer = loader.load()
            observer.on('workout.added', added)

            expect(await waitForDone(observer)).toBe(true)
            expect(added).not.toHaveBeenCalled()
        })

        test('reports done when loading the workouts fails',async ()=>{
            const api = new IncyclistWorkoutsApi()
            api.getWorkouts = jest.fn().mockRejectedValue(new Error('Network Error'))

            const observer = new WorkoutsApiLoader().load()

            expect(await waitForDone(observer)).toBe(true)
        })

        test('e2e test - should only be executed manually',async ()=>{

            const api = new IncyclistWorkoutsApi()
            api.getWorkouts = jest.fn().mockResolvedValue(testData)
           
            
            const loader = new WorkoutsApiLoader()
            const observer = loader.load()
            const workouts:Array<Workout|Plan> = []

            const load = () => new Promise (  (done)=> {
                observer.on( 'workout.added', workout=>{
                    workouts.push(workout)                
                })
                observer.on( 'workout.updated', workout=>{
                    console.log('updated ',workout.id, workout.name, workout.hash)
                })

                observer.on( 'done', done)
            })

            await load()
            expect(workouts.length).toBe(3)
            
        },6000)
    })

})