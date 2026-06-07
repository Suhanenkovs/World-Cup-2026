import { NextResponse } from "next/server";

interface FDPlayer { name: string; position: string }
interface FDTeam   { name: string; squad?: FDPlayer[] }

export async function GET() {
  try {
    const res = await fetch("https://api.football-data.org/v4/competitions/WC/teams", {
      headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY! },
      next: { revalidate: 3600 }, // cache 1 hour
    });

    if (!res.ok) {
      return NextResponse.json({ players: [] });
    }

    const json = await res.json();
    const teams: FDTeam[] = json.teams ?? [];

    const players: { name: string; team: string; position: string }[] = [];

    for (const team of teams) {
      if (!team.squad?.length) continue;
      for (const p of team.squad) {
        players.push({ name: p.name, team: team.name, position: p.position ?? "" });
      }
    }

    // Sort alphabetically by surname (last word)
    players.sort((a, b) => {
      const surnameA = a.name.split(" ").at(-1) ?? a.name;
      const surnameB = b.name.split(" ").at(-1) ?? b.name;
      return surnameA.localeCompare(surnameB);
    });

    return NextResponse.json({ players });
  } catch {
    return NextResponse.json({ players: [] });
  }
}
