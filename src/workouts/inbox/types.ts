export type WorkoutInboxImport = {
    /** name of the imported file (without extension) */
    name: string
    /** number of workouts/plans imported from the file */
    count: number
}

export type WorkoutInboxError = {
    name: string
    error: string
}
