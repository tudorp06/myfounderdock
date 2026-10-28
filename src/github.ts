// First learning milestone: public repository metadata only. No token needed.
export interface GitHubRepository {
  id: number;
  name: string;
  html_url: string;
  language: string | null;
  pushed_at: string | null;
  stargazers_count: number;
}

export interface GithubProfile {
    login: string;
    id: number;
    avatar_url: string; //from this I believe we get the pfp  to show in the card ?
    name: string | null;
}

export interface ContributionDay{
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface GithubContributions{
  total: Record<string, number>;
  contributions: ContributionDay[];
}

//this one is for the streak grid and user pfp + name
export async function fetchProfile(username: string): Promise<GithubProfile> {
    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}`
    );
    if (!response.ok){
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const profile: GithubProfile = await response.json();

    return profile;

}

export async function loadRepositories(username: string): Promise<GitHubRepository[]> {
  // Your turn: request public repos, handle a failed HTTP response,
  // and return the parsed repository array. We'll review this before UI wiring.
  const response = await fetch(
    `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&direction=desc&per_page=3`
  );
  if(!response.ok){
    throw new Error(`Github API error: ${response.status}`);
  }
  const repositories: GitHubRepository[] = await response.json();

  return repositories;
}

export async function loadContributions(username: string): Promise<GithubContributions>{
  const response = await fetch(
    `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(username)}?y=last`
  );
  if(!response.ok){
    throw new Error(`Contributions API error: ${response.status}`);
  }

  const contributions: GithubContributions = await response.json();

  return contributions;
}
