import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SchemaIssueList } from './SchemaIssueList';

const statusError =
  '.content.epics[0].status: should be equal to one of the allowed values (Correction Suggestion: Use one of -> draft, ready, in-progress)';

describe('SchemaIssueList', () => {
  it('shows each file with the first reason it fails', () => {
    render(<SchemaIssueList issues={[{ file: 'planning/epics.json', type: 'epics', errors: [statusError] }]} />);
    expect(screen.getByText('planning/epics.json')).toBeInTheDocument();
    expect(screen.getByText(statusError)).toBeInTheDocument();
  });

  it('counts the further reasons for a file', () => {
    render(<SchemaIssueList issues={[{ file: 'epics.json', type: 'epics', errors: ['first', 'second', 'third'] }]} />);
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.queryByText('second')).not.toBeInTheDocument();
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  it('lists at most three files and counts the rest', () => {
    const issues = ['a', 'b', 'c', 'd', 'e'].map((f) => ({ file: `${f}.json`, type: 'story', errors: ['x'] }));
    render(<SchemaIssueList issues={issues} />);
    expect(screen.getByText('c.json')).toBeInTheDocument();
    expect(screen.queryByText('d.json')).not.toBeInTheDocument();
    expect(screen.getByText('...and 2 more files')).toBeInTheDocument();
  });

  it('copes with a file that has no reasons', () => {
    render(<SchemaIssueList issues={[{ file: 'odd.json', type: 'story', errors: [] }]} />);
    expect(screen.getByText('odd.json')).toBeInTheDocument();
  });
});
