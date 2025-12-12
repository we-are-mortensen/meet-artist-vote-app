'use client';

import { useEffect } from 'react';
import { meet } from '@googleworkspace/meet-addons/meet.addons.screenshare';
import { CLOUD_PROJECT_NUMBER, SIDE_PANEL_URL } from '../shared/constants';

export default function App() {
  /**
   * Screensharing this page will prompt you to install/open this add-on.
   * When it is opened, it will prompt you to set up the add-on in the side
   * panel before starting the activity for everyone.
   * @see {@link https://developers.google.com/meet/add-ons/guides/screen-sharing}
   */
  useEffect(() => {
    meet.addon.screensharing.exposeToMeetWhenScreensharing({
      cloudProjectNumber: CLOUD_PROJECT_NUMBER,
      // Will open the Side Panel for the activity initiator to set the
      // activity starting state. Activity won't start for other participants.
      sidePanelUrl: SIDE_PANEL_URL,
      startActivityOnOpen: false,
    });
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-paper bg-confetti">
      <div className="max-w-2xl text-center">
        {/* Fun emoji header */}
        <div className="mb-6 flex justify-center gap-3">
          <span className="text-5xl animate-bounce" style={{ animationDelay: '0ms' }}>🎨</span>
          <span className="text-5xl animate-bounce" style={{ animationDelay: '100ms' }}>🖌️</span>
          <span className="text-5xl animate-bounce" style={{ animationDelay: '200ms' }}>✨</span>
        </div>

        <h1 className="font-heading text-5xl md:text-6xl font-bold text-crayon-purple mb-4">
          Votació de l&apos;Artista
        </h1>

        <p className="font-body text-xl text-text-primary mb-8">
          Comparteix aquesta pàgina per activar el complement de Google Meet i començar la votació.
        </p>

        <div className="bg-card border-4 border-crayon-blue hand-drawn p-6 mb-8 shadow-playful">
          <p className="font-heading text-xl text-crayon-blue font-bold mb-4">
            📺 Per començar:
          </p>
          <ol className="text-left font-body text-lg text-text-primary space-y-3">
            <li className="flex items-start gap-3">
              <span className="shrink-0 w-8 h-8 bg-crayon-pink text-white font-heading font-bold rounded-full flex items-center justify-center">1</span>
              <span>Comparteix aquesta pantalla a Google Meet</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="shrink-0 w-8 h-8 bg-crayon-blue text-white font-heading font-bold rounded-full flex items-center justify-center">2</span>
              <span>Obre el complement quan aparegui</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="shrink-0 w-8 h-8 bg-crayon-green text-white font-heading font-bold rounded-full flex items-center justify-center">3</span>
              <span>Comença la votació des del panell lateral</span>
            </li>
          </ol>
        </div>

        <p className="font-heading text-2xl text-crayon-yellow font-bold">
          Qui serà l&apos;artista d&apos;avui? 🌟
        </p>
      </div>
    </div>
  );
}
