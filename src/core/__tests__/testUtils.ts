import { readFileSync } from 'fs';
import { join } from 'path';

// __dirname resolves to out/core/__tests__ once compiled; fixtures live only under src/.
const FIXTURES_DIR = join(__dirname, '..', '..', '..', 'src', 'core', '__tests__', 'fixtures');

export function loadFixture(name: string): string {
	return readFileSync(join(FIXTURES_DIR, name), 'utf8');
}
