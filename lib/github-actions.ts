/**
 * lib/github-actions.ts — GitHub Actions workflow generation and status checking.
 *
 * Detects project type, generates CI workflow YAML,
 * and queries workflow run status via the GitHub API.
 */

/**
 * Detect the project type from package.json contents.
 */
export function detectProjectType(
  packageJson: any,
): 'node' | 'python' | 'static' | 'unknown' {
  if (!packageJson) return 'unknown';

  // Node project: has dependencies or scripts
  if (
    packageJson.dependencies ||
    packageJson.devDependencies ||
    packageJson.scripts
  ) {
    return 'node';
  }

  return 'unknown';
}

/**
 * Generate a GitHub Actions workflow YAML string.
 */
export function generateWorkflow(
  projectType: string,
  options?: { buildCmd?: string; testCmd?: string },
): string {
  const buildCmd = options?.buildCmd ?? (projectType === 'node' ? 'npm run build' : 'echo "No build step"');
  const testCmd = options?.testCmd ?? (projectType === 'node' ? 'npm test' : 'echo "No test step"');

  if (projectType === 'node') {
    return `name: Build & Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18, 20]

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js \${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: ${buildCmd}

      - name: Test
        run: ${testCmd}
`;
  }

  if (projectType === 'python') {
    return `name: Build & Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        python-version: ['3.10', '3.11', '3.12']

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python \${{ matrix.python-version }}
        uses: actions/setup-python@v5
        with:
          python-version: \${{ matrix.python-version }}

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt 2>/dev/null || true

      - name: Build
        run: ${buildCmd}

      - name: Test
        run: ${testCmd}
`;
  }

  // static / unknown — basic checkout + optional build
  return `name: Build & Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Build
        run: ${buildCmd}

      - name: Test
        run: ${testCmd}
`;
}

/**
 * Fetch the latest workflow run for a repo.
 */
export async function getLatestWorkflowRun(params: {
  owner: string;
  repo: string;
  pat: string;
}): Promise<{
  status: string;
  conclusion: string | null;
  url: string;
  updatedAt: string;
} | null> {
  const { owner, repo, pat } = params;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=1`,
      {
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: 'application/vnd.github+json',
        },
      },
    );

    if (!res.ok) return null;

    const data = await res.json();
    const runs = data.workflow_runs;
    if (!runs || runs.length === 0) return null;

    const run = runs[0];
    return {
      status: run.status,
      conclusion: run.conclusion,
      url: run.html_url,
      updatedAt: run.updated_at,
    };
  } catch {
    return null;
  }
}

/**
 * Get workflow run logs URL.
 * Returns the download URL for the logs zip, or null on failure.
 */
export async function getWorkflowLogs(params: {
  owner: string;
  repo: string;
  runId: number;
  pat: string;
}): Promise<string | null> {
  const { owner, repo, runId, pat } = params;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/logs`,
      {
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: 'application/vnd.github+json',
        },
        redirect: 'manual',
      },
    );

    // The API returns a 302 redirect to the actual download URL
    if (res.status === 302) {
      return res.headers.get('location');
    }

    return null;
  } catch {
    return null;
  }
}
