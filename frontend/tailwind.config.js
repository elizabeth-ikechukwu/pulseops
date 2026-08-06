/** @type {import('tailwindcss').Config} */
// PulseOps design tokens: PagerDuty-style dark operations console.
// One accent (signal green), severity/status colors carry meaning,
// everything else stays near-monochrome.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#f6f7f9',        // page background, soft light gray
        panel: '#ffffff',      // surfaces, table, cards
        raise: '#f1f3f5',      // hover / raised surfaces
        line: '#e3e6ea',       // borders
        body: '#16191d',       // primary text, near-black
        dim: '#6b7280',        // secondary text
        signal: '#0a8a43',     // PagerDuty-green accent, darkened for contrast on white
        sev1: '#e0342a',
        sev2: '#c47f0a',
        sev3: '#1a68d1',
        okay: '#1a9c5c',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '4px',
      },
    },
  },
  plugins: [],
};
