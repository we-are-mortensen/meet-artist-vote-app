'use client';

import { useEffect, useState } from 'react';
import {
  meet,
  MeetSidePanelClient,
} from '@googleworkspace/meet-addons/meet.addons';
import {
  ACTIVITY_SIDE_PANEL_URL,
  CLOUD_PROJECT_NUMBER,
  MAIN_STAGE_URL,
} from '../../shared/constants';
import {
  generatePollId,
  parseCustomOptions,
  validateCustomOptions,
  stringsToPollOptions
} from '../../utils/voteCalculations';
import type { PollState, PollOption, PredefinedListsData } from '../../types/poll.types';
import predefinedListsData from '../../data/predefinedOptions.json';

/**
 * Setup side panel for the activity initiator
 * This is where the poll is configured and started
 * @see {@link https://developers.google.com/meet/add-ons/guides/overview#side-panel}
 */
export default function Page() {
  const [sidePanelClient, setSidePanelClient] = useState<MeetSidePanelClient>();
  const [isStarting, setIsStarting] = useState(false);

  // Option selection state
  const [optionsSource, setOptionsSource] = useState<'predefined' | 'custom'>('predefined');
  const [selectedListId, setSelectedListId] = useState('default');
  const [customOptionsText, setCustomOptionsText] = useState('');
  const [validationError, setValidationError] = useState<string>('');

  const predefinedLists = (predefinedListsData as PredefinedListsData).lists;

  /**
   * Gets the poll options based on current selection (for preview, no validation errors)
   */
  function getPreviewOptions(): PollOption[] | null {
    if (optionsSource === 'predefined') {
      const selectedList = predefinedLists.find(list => list.id === selectedListId);
      if (!selectedList) return null;
      return stringsToPollOptions(selectedList.options);
    } else {
      // Custom options
      if (!customOptionsText.trim()) {
        return null;
      }

      const validation = validateCustomOptions(customOptionsText);
      if (!validation.valid) {
        return null;
      }

      return parseCustomOptions(customOptionsText);
    }
  }

  /**
   * Gets the poll options and validates (sets error state if invalid)
   */
  function getPollOptionsWithValidation(): PollOption[] | null {
    if (optionsSource === 'predefined') {
      const selectedList = predefinedLists.find(list => list.id === selectedListId);
      if (!selectedList) return null;
      return stringsToPollOptions(selectedList.options);
    } else {
      // Custom options
      if (!customOptionsText.trim()) {
        setValidationError('Si us plau, introdueix almenys 2 opcions');
        return null;
      }

      const validation = validateCustomOptions(customOptionsText);
      if (!validation.valid) {
        setValidationError(validation.error || 'Opcions no vàlides');
        return null;
      }

      return parseCustomOptions(customOptionsText);
    }
  }

  /**
   * Starts the voting activity with selected options
   */
  async function startVoting() {
    if (!sidePanelClient) {
      throw new Error('Side Panel is not yet initialized!');
    }

    // Clear previous errors
    setValidationError('');

    // Get poll options with validation
    const pollOptions = getPollOptionsWithValidation();
    if (!pollOptions) {
      return; // Validation error already set
    }

    setIsStarting(true);

    try {
      // Initialize poll state with options
      const pollState: PollState = {
        options: pollOptions,
        votes: [],
        status: 'voting',
        question: "Qui és l'artista d'avui?",
        pollId: generatePollId(),
        round: 1,
        optionsSource: optionsSource,
      };

      await sidePanelClient.startActivity({
        mainStageUrl: MAIN_STAGE_URL,
        sidePanelUrl: ACTIVITY_SIDE_PANEL_URL,
        // Pass the initial poll state with options
        additionalData: JSON.stringify(pollState),
      });

      // Mark this browser tab as the activity host before redirecting
      sessionStorage.setItem('isActivityHost', 'true');
      window.location.replace(ACTIVITY_SIDE_PANEL_URL + window.location.search);
    } catch (error) {
      console.error('Error starting voting activity:', error);
      setIsStarting(false);
      alert('Error iniciant la votació. Torna-ho a provar.');
    }
  }

  useEffect(() => {
    /**
     * Initializes the Add-on Side Panel Client.
     */
    async function initializeSidePanelClient() {
      const session = await meet.addon.createAddonSession({
        cloudProjectNumber: CLOUD_PROJECT_NUMBER,
      });
      const client = await session.createSidePanelClient();
      setSidePanelClient(client);
    }
    initializeSidePanelClient();
  }, []);

  // Get current preview options
  const previewOptions = getPreviewOptions();

  return (
    <div className="min-h-screen flex flex-col p-6 bg-white dark:bg-gray-900">
      <div className="max-w-md mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Votació de l&apos;Artista
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Configura les opcions de votació
          </p>
        </div>

        {/* Option source selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Opcions de votació:
          </label>

          {/* Predefined option */}
          <label className={`
            flex items-start p-4 rounded-lg border-2 cursor-pointer mb-3 transition-all
            ${optionsSource === 'predefined'
              ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-blue-400'}
          `}>
            <input
              type="radio"
              name="optionsSource"
              value="predefined"
              checked={optionsSource === 'predefined'}
              onChange={() => setOptionsSource('predefined')}
              className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500"
            />
            <div className="ml-3 flex-1">
              <span className="block font-medium text-gray-900 dark:text-gray-100">
                Utilitzar llista predefinida
              </span>
              <span className="block text-sm text-gray-600 dark:text-gray-400 mt-1">
                Selecciona una llista de noms ja configurada
              </span>

              {optionsSource === 'predefined' && (
                <select
                  value={selectedListId}
                  onChange={(e) => setSelectedListId(e.target.value)}
                  className="mt-3 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                    bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                    focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {predefinedLists.map(list => (
                    <option key={list.id} value={list.id}>
                      {list.name} ({list.options.length} opcions)
                    </option>
                  ))}
                </select>
              )}
            </div>
          </label>

          {/* Custom option */}
          <label className={`
            flex items-start p-4 rounded-lg border-2 cursor-pointer transition-all
            ${optionsSource === 'custom'
              ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-blue-400'}
          `}>
            <input
              type="radio"
              name="optionsSource"
              value="custom"
              checked={optionsSource === 'custom'}
              onChange={() => setOptionsSource('custom')}
              className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500"
            />
            <div className="ml-3 flex-1">
              <span className="block font-medium text-gray-900 dark:text-gray-100">
                Crear llista personalitzada
              </span>
              <span className="block text-sm text-gray-600 dark:text-gray-400 mt-1">
                Introdueix els noms, un per línia
              </span>

              {optionsSource === 'custom' && (
                <textarea
                  value={customOptionsText}
                  onChange={(e) => {
                    setCustomOptionsText(e.target.value);
                    setValidationError('');
                  }}
                  placeholder="Anna&#10;Bernat&#10;Carla&#10;David"
                  rows={6}
                  className="mt-3 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                    bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                    focus:ring-2 focus:ring-blue-500 focus:border-transparent
                    font-mono text-sm resize-none"
                />
              )}
            </div>
          </label>
        </div>

        {/* Validation error */}
        {validationError && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-200">
              {validationError}
            </p>
          </div>
        )}

        {/* Preview section */}
        {previewOptions && previewOptions.length > 0 && (
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Vista prèvia ({previewOptions.length} opcions):
            </h3>
            <ul className="space-y-1 max-h-32 overflow-y-auto">
              {previewOptions.slice(0, 10).map((option, index) => (
                <li key={option.id} className="text-sm text-gray-600 dark:text-gray-400">
                  {index + 1}. {option.name}
                </li>
              ))}
              {previewOptions.length > 10 && (
                <li className="text-sm text-gray-500 dark:text-gray-500 italic">
                  ... i {previewOptions.length - 10} més
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Question preview */}
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Pregunta:
          </h3>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Qui és l&apos;artista d&apos;avui?
          </p>
        </div>

        {/* Start button */}
        <button
          onClick={startVoting}
          disabled={!sidePanelClient || isStarting}
          aria-label="Començar la votació"
          className={`
            w-full py-4 px-6 rounded-lg font-semibold text-white text-lg
            transition-all duration-200
            ${
              !sidePanelClient || isStarting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 active:bg-green-800 hover:shadow-lg'
            }
            flex items-center justify-center gap-2
          `}
        >
          {isStarting ? (
            <>
              <span className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></span>
              <span>Iniciant votació...</span>
            </>
          ) : (
            <>
              <span>🎨</span>
              <span>Començar votació</span>
            </>
          )}
        </button>

        {!sidePanelClient && (
          <p className="text-center text-sm text-gray-500 dark:text-gray-500 mt-4">
            Inicialitzant...
          </p>
        )}
      </div>
    </div>
  );
}
