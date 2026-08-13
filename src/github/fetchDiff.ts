import * as github from '@actions/github';

export interface ChangedFile {
  filename: string;
  status: string;
  patch?: string;
}

export async function fetchChangedFiles(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<ChangedFile[]> {
  const { data } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: pullNumber,
  });

  return data.map(file => ({
    filename: file.filename,
    status: file.status,
    patch: file.patch,
  }));
}
