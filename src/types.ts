// StatBook Excel parsing results

export type ScoreRowTeam = {
    jammer: string,
    points: number[],
    total: number,
    lead: boolean
}
export type ScoreRow = {
    jam: number,
    period: number,
    team1: ScoreRowTeam,
    team2: ScoreRowTeam
}

export type PenaltiesRow = {
    team: number,
    period: number,
    skater: string,
    penalty: string,
    jam: number,
}

export type LineupRowTeam = {
    lineup: string[],
    pivot: string,
}

export type LineupRow = {
    jam: number,
    period: number,
    team1: LineupRowTeam,
    team2: LineupRowTeam
}

export type Game = {
    team1: string,
    team2: string,
    date: string,
    scoreData: ScoreRow[],
    penaltiesData: PenaltiesRow[],
    lineupsData: LineupRow[],
}

// Processing results

export type Skater = {
    team: string,
    number: string,
    games: number,
    jams: number,
    pointsFor: number,
    pointsAgainst: number,
    vtars: number[]
    jammers: number,
    pivots: number,
    jammerLeads: number,
    penaltyTotal: number,
    penalties: string[]
}

export type SkaterProcessed = Skater & {
    avg: number, // Average amount of point differential per jam
    avtar: number, // Average VTAR: The difference in expected points per jam when the skater is on the track vs the team average
    vtarStddev: number, // Standard deviation of the AVTAR
    variability?: number, // Ratio of skater VTAR σ to team average
    ppjp: number, // Penalties per jam percentage: Average probability the skater gets a penalty in a jam
    jlp?: number, // Jammer lead percentage
    positions: [number, number, number] // Skater jam positions: as jammer, as pivot, as non-pivot blocker
}

export type TeamStat = {
    name: string,
    games: number,
    jams: number,
    pointsFor: number,
    pointsAgainst: number,
    penaltyTotal: number,
    penalties: string[]
}

export type TeamStatProcessed = TeamStat & {
    ppjp: number,
    penaltyTendencies: {
        penalty: string,
        teamAmount: number,
        teamRatio: number,
        averageRatio: number,
        totalRatio: number,
        tendency: number, // Index (as percentage) for how likely a team is to get a specific penalty compared to the average
        normalizedTendency: number, // Index (as percentage) for how big a proportion of the team's penalties are a specific penalty compared to the average (i.e. tendency that is not affected by the team's overall penalty tendency)
    }[]
}

export type Output = {
    total: {
        games: number
    },
    skaters: SkaterProcessed[],
    jammers: SkaterProcessed[],
    blockers: SkaterProcessed[],
    teams: TeamStatProcessed[],
}