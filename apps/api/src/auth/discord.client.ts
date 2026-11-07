import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';

const API = 'https://discord.com/api/v10';

export interface DiscordIdentity {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  /** Whether the user is a member of the configured guild (the association). */
  isMember: boolean;
}

/** Minimal Discord OAuth2 client (authorization code flow). */
@Injectable()
export class DiscordClient {
  constructor(private readonly config: AppConfig) {}

  get enabled(): boolean {
    return this.config.discord !== null;
  }

  authorizeUrl(state: string): string {
    const discord = this.requireConfig();
    const params = new URLSearchParams({
      client_id: discord.clientId,
      redirect_uri: discord.redirectUri,
      response_type: 'code',
      scope: 'identify guilds.members.read',
      state,
      prompt: 'none',
    });
    return `https://discord.com/oauth2/authorize?${params}`;
  }

  async identify(code: string): Promise<DiscordIdentity> {
    const discord = this.requireConfig();
    const tokenResponse = await fetch(`${API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: discord.clientId,
        client_secret: discord.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: discord.redirectUri,
      }),
    });
    if (!tokenResponse.ok) throw new ServiceUnavailableException('Discord token exchange failed');
    const { access_token } = (await tokenResponse.json()) as { access_token: string };
    const headers = { Authorization: `Bearer ${access_token}` };

    const userResponse = await fetch(`${API}/users/@me`, { headers });
    if (!userResponse.ok) throw new ServiceUnavailableException('Discord user lookup failed');
    const user = (await userResponse.json()) as {
      id: string;
      username: string;
      global_name: string | null;
      avatar: string | null;
    };

    const memberResponse = await fetch(`${API}/users/@me/guilds/${discord.guildId}/member`, {
      headers,
    });
    const member = memberResponse.ok
      ? ((await memberResponse.json()) as { nick: string | null })
      : null;

    return {
      id: user.id,
      displayName: member?.nick ?? user.global_name ?? user.username,
      avatarUrl: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
        : null,
      isMember: member !== null,
    };
  }

  private requireConfig() {
    if (!this.config.discord)
      throw new ServiceUnavailableException('Discord sign-in is not configured');
    return this.config.discord;
  }
}
