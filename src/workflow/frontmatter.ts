import * as yaml from 'yaml';

export function parseFrontmatter(content: string): { frontmatter: any; body: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) {
        return { frontmatter: {}, body: content };
    }

    try {
        return {
            frontmatter: yaml.parse(match[1]),
            body: match[2].trim()
        };
    } catch {
        return { frontmatter: {}, body: content };
    }
}
