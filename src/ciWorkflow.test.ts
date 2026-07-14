import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const workflowPath = '.github/workflows/ci.yml';
const workflow = () => readFileSync(workflowPath, 'utf8');

describe('CI workflow contract', () => {
  test('gates pull requests and main pushes without cancelling main results', () => {
    const source = workflow();

    expect(source).toMatch(/pull_request:\s*\n/);
    expect(source).toMatch(/push:\s*\n\s+branches:\s*\[main\]/);
    expect(source).toContain('group: ci-${{ github.workflow }}-${{ github.ref }}');
    expect(source).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
  });

  test('uses the documented Node and npm versions and the committed lockfile', () => {
    const source = workflow();
    const packageManifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
      packageManager?: string;
    };
    const nodeVersion = readFileSync('.nvmrc', 'utf8').trim();
    const npmVersion = packageManifest.packageManager?.replace('npm@', '');

    expect(nodeVersion).toMatch(/^22\.\d+\.\d+$/);
    expect(npmVersion).toMatch(/^10\.\d+\.\d+$/);
    expect(source).toContain('node-version-file: .nvmrc');
    expect(source).toContain(`npm install --global npm@${npmVersion}`);
    expect(source).toContain('npm ci');
  });

  test('runs every required package script and installs Chromium from locked dependencies', () => {
    const source = workflow();
    const packageManifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    const requiredScripts = ['check', 'test:unit', 'test:e2e', 'build'];

    for (const script of requiredScripts) {
      expect(packageManifest.scripts[script]).toBeTypeOf('string');
      expect(source).toContain(`bash scripts/run-without-network.sh npm run ${script}`);
    }

    expect(source).toContain('npm exec -- playwright install --with-deps chromium');
  });

  test('uses temporary SQLite storage without production providers or secrets', () => {
    const source = workflow();

    expect(source).toContain('echo "DATABASE_URL=$RUNNER_TEMP/daily-ci.db" >> "$GITHUB_ENV"');
    expect(source).not.toContain('${{ runner.temp }}');
    expect(source).not.toContain('secrets.');
    expect(source).not.toMatch(
      /accounts\.google\.com|googleapis\.com|maps\.googleapis\.com|open-meteo\.com|api\.resend\.com|ssh|scp/
    );
    expect(source).not.toMatch(
      /GOOGLE_CLIENT_SECRET|GOOGLE_MAPS_API_KEY|RESEND_API_KEY|RESEND_FROM_EMAIL/
    );
  });

  test('runs validation in a network namespace that only exposes loopback', () => {
    const isolationScript = readFileSync('scripts/run-without-network.sh', 'utf8');

    expect(isolationScript).toContain('unshare --net');
    expect(isolationScript).toContain('ip link set lo up');
    expect(isolationScript).toContain('runuser');
    expect(isolationScript).toContain('sudo --non-interactive');
    expect(isolationScript).toContain('export PATH="$3"');
  });
});
