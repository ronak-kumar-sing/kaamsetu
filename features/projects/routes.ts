import type { Href } from 'expo-router';

// Typed href builders so screens never hand-assemble path strings.
export const routes = {
  project: (id: string): Href => ({ pathname: '/project/[id]', params: { id } }),
  milestone: (id: string): Href => ({ pathname: '/milestone/[id]', params: { id } }),
  profile: (id: string): Href => ({ pathname: '/profile/[id]', params: { id } }),
  invite: (token: string): Href => ({ pathname: '/invite/[token]', params: { token } }),
  newProposal: (projectId: string): Href => ({
    pathname: '/proposal/new',
    params: { projectId },
  }),
  editDraft: (draftId: string): Href => ({ pathname: '/client/post-project', params: { draftId } }),
  postProject: '/client/post-project' as Href,
  browse: '/freelancer/browse' as Href,
};
