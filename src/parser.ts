import xlsx from 'node-xlsx';
import _ from 'lodash';
import fs from 'fs';
import path from 'path';
import Config from '../config/config.json';
import { ScoreRow, PenaltiesRow, LineupRow, Game, Skater, TeamStat, TeamStatProcessed, Output, SkaterProcessed } from './types';

const handleScoreSheetRow = (row: any[], i: number): ScoreRow | null => {
    if (i < 3 || (i > 40 && i < 45) || i > 82) return null; // Skip non-jam rows of sheet
    if (!_.isNumber(row[0])) return null; // Skip SP rows for now
    const isSecondPeriod = i > 41;

    const points1 = row.slice(7, 16).filter(p => p != null);
    const points2 = row.slice(26, 35).filter(p => p != null);

    const jam = {
        jam: row[0],
        period: isSecondPeriod ? 2 : 1,
        team1: {
            jammer: ''+row[1],
            points: points1,
            total: _.sum(points1),
            lead: !!row[3],
        },
        team2: {
            jammer: ''+row[20],
            points: points2,
            total: _.sum(points2),
            lead: !!row[22],
        },
    }
    return jam;
}
const handleScoreSheet = (data: any[][]) => data.map(handleScoreSheetRow).filter((s): s is ScoreRow => Boolean(s));

const handlePenaltiesSheet = (data: unknown[][]): PenaltiesRow[] => {
    const pairRows: any = (acc: any, rows: any) => rows.length > 1 ? pairRows([...acc, [rows[0], rows[1]]], rows.slice(2)): acc;
    return pairRows([], data.slice(3, 43)).reduce((acc: any, c: any) => {
        const ps = [c[0][0], c[0][15]]

        return [...acc, ...c[0].map((o: any, i: number) => {
            const team = (i > 0 && i < 10) || (i > 28 && i < 38) ? 1 : (i > 15 && i < 25) || (i > 43 && i < 53) ? 2 : null;
            const period = (i > 0 && i < 10) || (i > 15 && i < 25) ? 1 : (i > 28 && i < 38) || (i > 43 && i < 53) ? 2 : null;
            if (team == null || o?.length !== 1) return null;
            return {
                team,
                period,
                skater: ''+ps[team-1],
                penalty: o.toUpperCase(),
                jam: c[1][i]
            }
        }).filter((p: any): p is PenaltiesRow => Boolean(p))]
    }, [])
}

const handleLineupsSheet = (data: unknown[][]): LineupRow[] => {
    return data.map((row, i) => {
        if (i < 3 || (i > 40 && i < 45) || i > 82) return; // Skip non-jam rows of sheet
        if (!_.isNumber(row[0])) return; // Skip SP rows for now
        const isSecondPeriod = i > 41;

        const team1 = [''+row[2], ''+row[6], ''+row[10], ''+row[14], ''+row[18]];
        const team1Pivot = !!row[1] ? null : ''+row[6];
        const team2 = [''+row[28], ''+row[32], ''+row[36], ''+row[40], ''+row[44]];
        const team2Pivot = !!row[27] ? null : ''+row[32];

        return {
            jam: row[0],
            period: isSecondPeriod ? 2 : 1,
            team1: {
                lineup: team1,
                pivot: team1Pivot,
            },
            team2: {
                lineup: team2,
                pivot: team2Pivot,
            }
        }
    }).filter((j): j is LineupRow => Boolean(j))
}

const files = fs.readdirSync('data', { withFileTypes: true }).filter(f => !f.isDirectory() && f.name.startsWith('STATS')).map(f => path.join('data', f.name));

const handleFile = (file: string): Game => {
    console.log(`Parsing file ${file}`);

    const workSheetsFromFile = xlsx.parse(file);

    const igrf = workSheetsFromFile.find(s => s.name === 'IGRF')?.data as any[][];
    const team1 = igrf[9][1];
    const team2 = igrf[9][8];
    const date = igrf[8][1];

    const sheetScore = workSheetsFromFile.find(s => s.name === 'Score');
    const scoreData = handleScoreSheet(sheetScore?.data as unknown[][]);
    
    const sheetPenalties = workSheetsFromFile.find(s => s.name === 'Penalties');
    const penaltiesData = handlePenaltiesSheet(sheetPenalties?.data as unknown[][]);
    
    const sheetLineups = workSheetsFromFile.find(s => s.name === 'Lineups');
    const lineupsData = handleLineupsSheet(sheetLineups?.data as unknown[][])
    
    return {
        team1,
        team2,
        date,
        scoreData,
        penaltiesData,
        lineupsData,
    }
}

const stddev = (array: number[]) => {
    if (array.length === 0) return null;
    const mean = array.reduce((a, b) => a + b) / array.length
    return Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / array.length)
}

const run = () => {
    const games = files.map(handleFile);
    console.log('All files parsed, processing data...')
    const skaters = [] as Skater[];
    const jammerSkaters = [] as Skater[];
    const blockerSkaters = [] as Skater[];
    const teamStats = [] as TeamStat[];

    const getSkater = (skaterSet: Skater[], team: string, rawNumber: string) => {
        const number = (Config.numberAdjustmentMapping.find(nam => nam.team === team && nam.rawNumber === rawNumber)?.realNumber) || rawNumber;
        const existing = skaterSet.find(s => s.team === team && s.number === number);
        if (!existing) {
            const skater = {
                team,
                number,
                games: 0,
                jams: 0,
                pointsFor: 0,
                pointsAgainst: 0,
                vtars: [],
                jammers: 0,
                pivots: 0,
                jammerLeads: 0,
                penaltyTotal: 0,
                penalties: []
            };
            skaterSet.push(skater);
            return skater;
        } else {
            return existing;
        }
    }

    const getTeam = (name: string) => {
        const existing = teamStats.find(t => t.name === name)
        if (!existing) {
            const team = {
                name,
                games: 0,
                jams: 0,
                pointsFor: 0,
                pointsAgainst: 0,
                penaltyTotal: 0,
                penalties: [],
            };
            teamStats.push(team);
            return team;
        } else {
            return existing;
        }
    }

    const increment = (entity: Skater | TeamStat, field: string, amount: number) => entity[field] = (entity[field] || 0) + amount;
    
    games.forEach((g) => {
        const teams = [g.team1, g.team2];
        const team1Skaters = _.uniq(g.lineupsData.map(l => l.team1.lineup).flat());
        const team2Skaters = _.uniq(g.lineupsData.map(l => l.team2.lineup).flat());
        team1Skaters.forEach(n => increment(getSkater(skaters, g.team1, n), 'games', 1));
        team2Skaters.forEach(n => increment(getSkater(skaters, g.team2, n), 'games', 1));
        increment(getTeam(teams[0]), 'games', 1);
        increment(getTeam(teams[1]), 'games', 1);

        const jamScoreDiffs = g.scoreData.map(s => {
            const d1 = s.team1.total - s.team2.total
            const d2 = s.team2.total - s.team1.total
            return [d1, d2];
        });
        const tjsds = [_.mean(jamScoreDiffs.map(jsr => jsr[0])), _.mean(jamScoreDiffs.map(jsr => jsr[1]))]

        g.lineupsData.forEach(l => {
            const correspondingScoreRow = g.scoreData.find(s => s.jam === l.jam && s.period === l.period);
            const totals = [correspondingScoreRow?.team1.total || 0, correspondingScoreRow?.team2.total || 0]
            const jsds = [totals[0] - totals[1], totals[1] - totals[0]]
            const vtars = [jsds[0] - tjsds[0], jsds[1] - tjsds[1]]
            
            const handleTeam = (team: string, lineup: string[], pivot: string, lead: boolean, vtar: number, pointsFor: number, pointsAgainst: number) => {
                const noteJamForSkater = (skater: Skater, n: string, i: number) => {
                    increment(skater, 'jams', 1)
                    increment(skater, 'pointsFor', pointsFor)
                    increment(skater, 'pointsAgainst', pointsAgainst)
                    if (pivot === n) increment(skater, 'pivots', 1)
                    if (i === 0) increment(skater, 'jammers', 1)
                    if (i === 0 && lead) increment(skater, 'jammerLeads', 1)
                    skater.vtars = [...(skater.vtars || []), vtar]
                }
                const noteJamForTeam = (team: string) => {
                    const teamStat = getTeam(team);
                    increment(teamStat, 'jams', 1);
                    increment(teamStat, 'pointsFor', pointsFor)
                    increment(teamStat, 'pointsAgainst', pointsAgainst)
                }
                lineup.forEach((n, i) => {
                    noteJamForSkater(getSkater(skaters, team, n), n, i);
                    if (i === 0) noteJamForSkater(getSkater(jammerSkaters, team, n), n, i)
                    if (i > 0) noteJamForSkater(getSkater(blockerSkaters, team, n), n, i)
                })
                noteJamForTeam(team);
            }
            
            handleTeam(g.team1, l.team1.lineup, l.team1.pivot, correspondingScoreRow?.team1.lead || false, Math.round(vtars[0]*100)/100, correspondingScoreRow?.team1.total || 0, correspondingScoreRow?.team2.total || 0);
            handleTeam(g.team2, l.team2.lineup, l.team2.pivot, correspondingScoreRow?.team2.lead || false, Math.round(vtars[1]*100)/100, correspondingScoreRow?.team2.total || 0, correspondingScoreRow?.team1.total || 0);
        })

        g.penaltiesData.forEach(p => {
            const notePenaltyForEntity = (skater: Skater | TeamStat, penalty: string) => {
                skater.penaltyTotal = (skater.penaltyTotal || 0) + 1;
                skater.penalties = [...(skater.penalties || []), p.penalty];
            }
            notePenaltyForEntity(getSkater(skaters, teams[p.team-1], p.skater), p.penalty)
            notePenaltyForEntity(getTeam(teams[p.team-1]), p.penalty);

            const asJammer = p.skater === g.lineupsData.find(l => l.jam === p.jam && l.period === p.period)?.[p.team === 1 ? 'team1' : 'team2'].lineup[0]
            if (asJammer) notePenaltyForEntity(getSkater(jammerSkaters, teams[p.team-1], p.skater), p.penalty)
            else notePenaltyForEntity(getSkater(blockerSkaters, teams[p.team-1], p.skater), p.penalty)
        })
    });

    const postProcessSkaterSet = (skaterSet: Skater[]): SkaterProcessed[] => {
        const skaterSetProcessed = skaterSet.map((skater): SkaterProcessed => {
            const avtar = _.mean(skater.vtars)
            const avg = Math.round((skater.pointsFor*100 - skater.pointsAgainst) / skater.jams)/100
            return {
                ...skater,
                avg,
                avtar: Math.round(avtar*100)/100,
                vtarStddev: Math.round(stddev(skater.vtars)*100)/100,
                ppjp: Math.round((skater.penaltyTotal||0)*100/skater.jams),
                jlp: !!skater.jammers ? Math.round((skater.jammerLeads||0)*100/skater.jammers) : null,
                positions: [skater.jammers || 0, skater.pivots || 0, skater.jams - (skater.jammers || 0) - (skater.pivots || 0)],
            }
        })

        skaterSetProcessed.forEach(skater => {
            const teamVtarStddevMean = _.mean(skaterSetProcessed.filter(s => s.team === skater.team).map(s => s.vtarStddev))
            skater.variability = Math.round(skater.vtarStddev*100 / teamVtarStddevMean);
        })
        return _.orderBy(skaterSetProcessed, ['team', 'number'], 'asc');
    } 
    
    const penaltyCodes = 'ABCDEFGHILMNPX'.split('');
    const allPenalties = teamStats.map(t => t.penalties).flat();
    const processedTeams: TeamStatProcessed[] = teamStats.map(ts => {
        const ppjp = Math.round((ts.penaltyTotal||0)*100/ts.jams);

        const penaltyTendencies = (() => {
            const totals = penaltyCodes.reduce((a, c) => {
              const amount = allPenalties.filter(p => p === c).length;
              a[c] = {
                amount,
                ratio: Math.round(amount*1000 / allPenalties.length)/1000,
              }
              return a;
            }, {});
            return penaltyCodes.map(p => {
                const teamAmount = ts.penalties.filter(tp => tp === p).length;
                const teamRatio = Math.round(teamAmount*1000 / ts.penalties.length)/1000;
                const totalRatio = Math.round(teamAmount*1000 / totals[p].amount)/1000;
                const tendency = Math.round(totalRatio*100/(ts.games/(games.length*2)))
                const normalizedTendency = Math.round(teamRatio*100/totals[p].ratio)
                return { penalty: p, teamAmount, teamRatio, averageRatio: totals[p].ratio, totalRatio, normalizedTendency, tendency }
              
            }).flat().filter(tps => tps.teamAmount > 5)
          })()

        return {
            ...ts,
            ppjp,
            penaltyTendencies, 
        }
    })

    const result: Output = {
        total: {
            games: games.length,
        },
        skaters: postProcessSkaterSet(skaters),
        jammers: postProcessSkaterSet(jammerSkaters),
        blockers: postProcessSkaterSet(blockerSkaters),
        teams: processedTeams
    }
    
    fs.writeFileSync('./output.json', JSON.stringify(result, null, 2), 'utf-8');
    console.log('Data written to output.json')
}

run();