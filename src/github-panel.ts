import { loadContributions, loadRepositories, type ContributionDay, type GithubContributions, type GitHubRepository } from './github';



const cache = new Map<string, { expires: number; promise: Promise<unknown> }>();

function cached<T>(key: string, request: () => Promise<T>): Promise<T> {

  const previous = cache.get(key);

  if (previous && previous.expires > Date.now()) return previous.promise as Promise<T>;

  const promise = request().catch(error => { cache.delete(key); throw error; });

  cache.set(key, { expires: Date.now() + 5 * 60_000, promise });

  return promise;

}



function text(tag: string, value: string, className = '') {

  const node = document.createElement(tag);

  node.textContent = value;

  node.className = className;

  return node;

}



function errorState(section: HTMLElement, label: string, retry: () => void) {

  section.removeAttribute('aria-busy');

  const message = text('p', label, 'github-message');

  message.setAttribute('role', 'status');

  const button = text('button', 'Try again', 'github-retry');

  button.addEventListener('click', retry);

  section.replaceChildren(message, button);

}



function renderCalendar(section: HTMLElement, data: GithubContributions) {

  const now = new Date();

  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  const days = data.contributions.filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day.date)

    && day.date <= today && Number.isInteger(day.count) && day.count >= 0 && Number.isInteger(day.level) && day.level >= 0 && day.level <= 4)

    .sort((a, b) => a.date.localeCompare(b.date));

  if (!days.length) {

    section.replaceChildren(text('p', 'No public contribution history yet.', 'github-message'));

    return;

  }

  // Twenty calendar columns; future days in the final week stay blank.

  const last = days[days.length - 1].date;

  const lastDate = new Date(`${last}T00:00:00Z`);

  const start = new Date(lastDate);

  start.setUTCDate(start.getUTCDate() - lastDate.getUTCDay() - 19 * 7);

  const byDate = new Map<string, ContributionDay>(days.map(day => [day.date, day]));

  const grid = document.createElement('div');

  grid.className = 'heatmap';

  grid.setAttribute('role', 'img');

  grid.tabIndex = 0;

  let total = 0;

  for (let i = 0; i < 140; i++) {

    const date = new Date(start);

    date.setUTCDate(start.getUTCDate() + i);

    const key = date.toISOString().slice(0, 10);

    const day = byDate.get(key);

    const square = document.createElement('i');

    square.setAttribute('aria-hidden', 'true');

    if (key > last || !day) {

      square.className = 'calendar-outside';

    } else {

      total += day.count;

      square.dataset.level = String(day.level);

      square.title = `${day.count} contribution${day.count === 1 ? '' : 's'} on ${key}`;

    }

    grid.append(square);

  }

  const count = total.toLocaleString();

  grid.setAttribute('aria-label', `${count} contributions from ${start.toISOString().slice(0, 10)} to ${last}. Each column is one week, Sunday to Saturday.`);

  const heading = text('div', '', 'contribution-summary');

  const todayDate = new Date(`${today}T00:00:00Z`);

  const weekStart = new Date(todayDate);

  weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay()+6)%7);

  let weekCount = 0, weekComplete = true;

  for (const date = new Date(weekStart); date <= todayDate; date.setUTCDate(date.getUTCDate()+1)) {

    const day = byDate.get(date.toISOString().slice(0,10));

    if (!day) weekComplete = false; else weekCount += day.count;

  }

  let streak = 0;

  const cursor = new Date(todayDate);

  // A day still in progress does not break yesterday's streak.

  if (!byDate.get(today)?.count) cursor.setUTCDate(cursor.getUTCDate()-1);

  while ((byDate.get(cursor.toISOString().slice(0,10))?.count ?? 0) > 0) {

    streak++; cursor.setUTCDate(cursor.getUTCDate()-1);

  }

  for (const [value,label] of [[byDate.has(today)?String(byDate.get(today)!.count):'—','today'],[weekComplete?String(weekCount):'—','this week'],[byDate.has(today)?String(streak):'—','day streak']]) {

    const stat = text('span', '', 'contribution-stat');

    stat.append(text('strong', value), text('span', label)); heading.append(stat);

  }

  heading.setAttribute('aria-label', 'Public contributions. Week starts Monday. Streak includes yesterday if today has no contributions.');

  const calendar = text('div', '', 'calendar-layout');

  const weekdays = text('div', '', 'calendar-weekdays');

  weekdays.setAttribute('aria-hidden', 'true');

  weekdays.append(text('span', 'Mon'), text('span', 'Wed'), text('span', 'Fri'));

  calendar.append(weekdays, grid);

  const caption = text('div', '', 'metric-caption');

  caption.append(text('span', `${count} · last 20 weeks`));

  const legend = text('span', '', 'contribution-legend');

  legend.setAttribute('aria-hidden', 'true');

  legend.append(text('span', 'Less'));

  for (let level = 0; level <= 4; level++) {

    const square = document.createElement('i');

    square.dataset.level = String(level);

    legend.append(square);

  }

  legend.append(text('span', 'More'));

  caption.append(legend);

  section.replaceChildren(heading, calendar, caption);

}



function renderRepositories(section: HTMLElement, repositories: GitHubRepository[]) {

  const heading = text('div', '', 'section-heading');

  heading.append(text('h2', 'Recent repositories'), text('span', 'Last pushed'));

  const list = document.createElement('ol');

  list.className = 'repo-list';

  for (const repo of repositories.slice(0, 3)) {

    const url = new URL(repo.html_url);

    if (url.protocol !== 'https:' || url.hostname !== 'github.com') continue;

    const row = document.createElement('li');

    const link = document.createElement('a');

    link.href = url.href;

    link.target = '_blank';

    link.rel = 'noopener noreferrer';

    const glyph = text('span', '', 'repo-glyph');

    const icon = document.createElement('img');
    icon.src = '/logos/book.svg';
    icon.alt = '';
    icon.className = 'invert-logo';
    glyph.append(icon);

    const copy = text('span', '', 'repo-copy');

    copy.append(text('span', repo.name), text('small', repo.language ?? 'Repository'));

    link.append(glyph, copy);

    row.append(link);

    list.append(row);

  }

  section.replaceChildren(heading, list);

  if (!list.children.length) section.append(text('p', 'No public repositories yet.', 'github-message'));

}



export async function mountGitHub(root: HTMLElement, username: string) {

  const calendar = root.querySelector<HTMLElement>('.heatmap-section')!;

  const repos = root.querySelector<HTMLElement>('.repos-section')!;

  calendar.setAttribute('aria-busy', 'true');

  repos.setAttribute('aria-busy', 'true');

  calendar.innerHTML = '<div class="metric-label"><h2>Contributions</h2><span>—</span></div><div class="heatmap" aria-hidden="true">' + '<i></i>'.repeat(140) + '</div><p class="github-message" role="status">Loading contributions…</p>';

  repos.replaceChildren(text('h2', 'Recent repositories'), text('p', 'Loading repositories…', 'github-message'));

  const retry = () => { if (calendar.isConnected) void mountGitHub(root, username); };

  // Fetch independently: one failed source must not hide the other source's data.

  await Promise.allSettled([

    cached(`calendar:${username}`, () => loadContributions(username)).then(data => {

      if (!calendar.isConnected) return;

      renderCalendar(calendar, data);

      calendar.removeAttribute('aria-busy');

    }).catch(error => {

      console.error('Contribution calendar', error);

      if (calendar.isConnected) errorState(calendar, 'Contribution calendar is unavailable.', retry);

    }),

    cached(`repos:${username}`, () => loadRepositories(username)).then(data => {

      if (!repos.isConnected) return;

      renderRepositories(repos, data);

      repos.removeAttribute('aria-busy');

    }).catch(error => {

      console.error('GitHub repositories', error);

      if (repos.isConnected) errorState(repos, 'Repositories are unavailable.', retry);

    }),

  ]);

}



// Use the default browser for native links; preview retains ordinary anchors.

document.addEventListener('click', async event => {

  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('.detail a') : null;

  if (!link || !('__TAURI_INTERNALS__' in window)) return;

  event.preventDefault();

  try {

    const { openUrl } = await import('@tauri-apps/plugin-opener');

    await openUrl(link.href);

  } catch (error) {

    console.error('Unable to open GitHub link', error);

    const footer = document.querySelector('.github-source');

    if (footer) footer.textContent = 'Could not open the browser. Please try again.';

  }

});
