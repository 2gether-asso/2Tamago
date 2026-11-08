export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'theme';
const ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Day/night preference: `system` follows the OS, otherwise it is forced. */
class Theme {
  choice = $state<ThemeChoice>('system');

  /** Call once on the client; app.html already applied the theme before first paint. */
  init() {
    this.choice = read();
  }

  cycle() {
    this.set(ORDER[(ORDER.indexOf(this.choice) + 1) % ORDER.length]!);
  }

  set(choice: ThemeChoice) {
    this.choice = choice;
    try {
      if (choice === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch {
      // Storage unavailable (private mode): the choice only lasts for this page.
    }
    if (choice === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = choice;
  }
}

export const theme = new Theme();
