"use client";

import { useEffect, useMemo, useState } from "react";
import { meet, MeetSidePanelClient } from "@googleworkspace/meet-addons/meet.addons";
import { ACTIVITY_SIDE_PANEL_URL, CLOUD_PROJECT_NUMBER, MAIN_STAGE_URL } from "../../shared/constants";
import { generatePollId, parseCustomOptions, validateCustomOptions, stringsToPollOptions } from "../../utils/voteCalculations";
import type { PollState, PollOption, PredefinedListsData } from "../../types/poll.types";
import predefinedListsData from "../../data/predefinedOptions.json";

/**
 * Setup side panel for the activity initiator
 * This is where the poll is configured and started
 * @see {@link https://developers.google.com/meet/add-ons/guides/overview#side-panel}
 */
export default function Page() {
  const [sidePanelClient, setSidePanelClient] = useState<MeetSidePanelClient>();
  const [isStarting, setIsStarting] = useState(false);

  // Option selection state
  const [optionsSource, setOptionsSource] = useState<"predefined" | "custom">("predefined");
  const [selectedListId, setSelectedListId] = useState("default");
  const [customOptionsText, setCustomOptionsText] = useState("");
  const [validationError, setValidationError] = useState<string>("");
  const [correctOptionId, setCorrectOptionId] = useState<string>("");

  const predefinedLists = (predefinedListsData as PredefinedListsData).lists;

  /**
   * Memoized preview options with stable IDs.
   * IDs must be stable across renders so the correct answer dropdown works.
   */
  const previewOptions = useMemo<PollOption[] | null>(() => {
    if (optionsSource === "predefined") {
      const selectedList = predefinedLists.find((list) => list.id === selectedListId);
      if (!selectedList) return null;
      return stringsToPollOptions(selectedList.options);
    } else {
      if (!customOptionsText.trim()) return null;
      const validation = validateCustomOptions(customOptionsText);
      if (!validation.valid) return null;
      return parseCustomOptions(customOptionsText);
    }
  }, [optionsSource, selectedListId, customOptionsText, predefinedLists]);

  // Reset correct answer selection when options change
  useEffect(() => {
    setCorrectOptionId("");
  }, [previewOptions]);

  /**
   * Starts the voting activity with selected options
   */
  async function startVoting() {
    if (!sidePanelClient) {
      throw new Error("Side Panel is not yet initialized!");
    }

    // Clear previous errors
    setValidationError("");

    // Validate custom options
    if (optionsSource === "custom") {
      if (!customOptionsText.trim()) {
        setValidationError("Si us plau, introdueix almenys 2 opcions");
        return;
      }
      const validation = validateCustomOptions(customOptionsText);
      if (!validation.valid) {
        setValidationError(validation.error || "Opcions no vàlides");
        return;
      }
    }

    if (!previewOptions || previewOptions.length === 0) {
      return;
    }

    if (!correctOptionId) {
      setValidationError("Si us plau, selecciona qui és l'artista d'avui");
      return;
    }

    setIsStarting(true);

    try {
      // Initialize poll state with options
      const pollState: PollState = {
        options: previewOptions,
        votes: [],
        status: "voting",
        pollId: generatePollId(),
        round: 1,
        optionsSource: optionsSource,
        correctOptionId: correctOptionId,
      };

      await sidePanelClient.startActivity({
        mainStageUrl: MAIN_STAGE_URL,
        sidePanelUrl: ACTIVITY_SIDE_PANEL_URL,
        // Pass the initial poll state with options
        additionalData: JSON.stringify(pollState),
      });

      // Mark this browser tab as the host for THIS specific poll
      // (storing pollId ensures a new activity in the same session won't inherit host status)
      sessionStorage.setItem("hostOfPollId", pollState.pollId);
      window.location.replace(ACTIVITY_SIDE_PANEL_URL + window.location.search);
    } catch (error) {
      console.error("Error starting voting activity:", error);
      setIsStarting(false);
      alert("Error iniciant la votació. Torna-ho a provar.");
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

  return (
    <div className="min-h-screen flex flex-col p-6 bg-paper">
      <div className="max-w-md mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="mb-3 flex justify-center gap-2">
            <span className="text-3xl">🎨</span>
            <span className="text-3xl">✨</span>
          </div>
          <h1 className="font-heading text-3xl font-bold text-crayon-purple mb-2">Qui és l&apos;artista?</h1>
          <p className="font-body text-base text-text-secondary">Configura les opcions de votació</p>
        </div>

        {/* Option source selection */}
        <div className="mb-6">
          <label className="block font-heading text-lg font-bold text-text-primary mb-3">Opcions de votació:</label>

          {/* Predefined option */}
          <label
            className={`
            flex items-start p-4 hand-drawn-subtle border-3 cursor-pointer mb-3 transition-all bg-card
            ${optionsSource === "predefined" ? "border-crayon-blue bg-crayon-blue/10 shadow-md" : "border-text-secondary/30 hover:border-crayon-blue/50"}
          `}
          >
            <div
              className={`
              w-6 h-6 rounded-full border-3 flex items-center justify-center mt-0.5
              ${optionsSource === "predefined" ? "border-crayon-blue bg-crayon-blue/20" : "border-text-secondary/40"}
            `}
            >
              {optionsSource === "predefined" && <div className="w-3 h-3 rounded-full bg-crayon-blue" />}
            </div>
            <input
              type="radio"
              name="optionsSource"
              value="predefined"
              checked={optionsSource === "predefined"}
              onChange={() => setOptionsSource("predefined")}
              className="sr-only"
            />
            <div className="ml-3 flex-1">
              <span className="block font-heading text-lg font-bold text-text-primary">Utilitzar llista predefinida</span>
              <span className="block font-body text-sm text-text-secondary mt-1">Selecciona una llista de noms ja configurada</span>

              {optionsSource === "predefined" && (
                <select
                  value={selectedListId}
                  onChange={(e) => setSelectedListId(e.target.value)}
                  className="mt-3 w-full px-3 py-2 border-2 border-crayon-blue/50 hand-drawn-subtle
                    bg-card text-text-primary font-body
                    focus:outline-none focus:border-crayon-blue focus:ring-2 focus:ring-crayon-blue/20"
                >
                  {predefinedLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name} ({list.options.length} opcions)
                    </option>
                  ))}
                </select>
              )}
            </div>
          </label>

          {/* Custom option */}
          <label
            className={`
            flex items-start p-4 hand-drawn-subtle border-3 cursor-pointer transition-all bg-card
            ${optionsSource === "custom" ? "border-crayon-pink bg-crayon-pink/10 shadow-md" : "border-text-secondary/30 hover:border-crayon-pink/50"}
          `}
          >
            <div
              className={`
              w-6 h-6 rounded-full border-3 flex items-center justify-center mt-0.5
              ${optionsSource === "custom" ? "border-crayon-pink bg-crayon-pink/20" : "border-text-secondary/40"}
            `}
            >
              {optionsSource === "custom" && <div className="w-3 h-3 rounded-full bg-crayon-pink" />}
            </div>
            <input
              type="radio"
              name="optionsSource"
              value="custom"
              checked={optionsSource === "custom"}
              onChange={() => setOptionsSource("custom")}
              className="sr-only"
            />
            <div className="ml-3 flex-1">
              <span className="block font-heading text-lg font-bold text-text-primary">Crear llista personalitzada</span>
              <span className="block font-body text-sm text-text-secondary mt-1">Introdueix els noms, un per línia</span>

              {optionsSource === "custom" && (
                <textarea
                  value={customOptionsText}
                  onChange={(e) => {
                    setCustomOptionsText(e.target.value);
                    setValidationError("");
                  }}
                  rows={6}
                  className="mt-3 w-full px-3 py-2 border-2 border-crayon-pink/50 hand-drawn-subtle
                    bg-card text-text-primary font-body
                    focus:outline-none focus:border-crayon-pink focus:ring-2 focus:ring-crayon-pink/20
                    resize-none"
                />
              )}
            </div>
          </label>
        </div>

        {/* Validation error */}
        {validationError && (
          <div className="mb-4 p-4 bg-crayon-red/10 border-3 border-crayon-red hand-drawn-subtle">
            <p className="font-body text-base text-crayon-red font-semibold">{validationError}</p>
          </div>
        )}

        {/* Preview section */}
        {previewOptions && previewOptions.length > 0 && (
          <div className="bg-crayon-yellow/10 border-3 border-crayon-yellow hand-drawn-subtle p-4 mb-6">
            <h3 className="font-heading text-base font-bold text-crayon-yellow mb-2">Vista prèvia ({previewOptions.length} opcions):</h3>
            <ul className="space-y-1 max-h-32 overflow-y-auto">
              {previewOptions.slice(0, 10).map((option, index) => (
                <li key={option.id} className="font-body text-sm text-text-primary">
                  {index + 1}. {option.name}
                </li>
              ))}
              {previewOptions.length > 10 && <li className="font-body text-sm text-text-secondary italic">... i {previewOptions.length - 10} més</li>}
            </ul>
          </div>
        )}

        {/* Correct answer selection */}
        {previewOptions && previewOptions.length > 0 && (
          <div className="mb-6">
            <label className="block font-heading text-lg font-bold text-text-primary mb-3">
              Qui és l&apos;artista d&apos;avui?
            </label>
            <select
              value={correctOptionId}
              onChange={(e) => {
                setCorrectOptionId(e.target.value);
                setValidationError("");
              }}
              className="w-full px-3 py-2 border-3 border-crayon-purple/50 hand-drawn-subtle
                bg-card text-text-primary font-body
                focus:outline-none focus:border-crayon-purple focus:ring-2 focus:ring-crayon-purple/20"
            >
              <option value="" disabled>
                Selecciona l&apos;artista...
              </option>
              {previewOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Start button */}
        <button
          onClick={startVoting}
          disabled={!sidePanelClient || isStarting}
          aria-label="Començar la votació"
          className={`
            w-full py-4 px-6 hand-drawn border-3
            font-heading text-xl font-bold text-white
            transition-all duration-200
            ${
              !sidePanelClient || isStarting
                ? "bg-text-secondary/40 border-text-secondary/40 cursor-not-allowed"
                : "bg-crayon-green border-crayon-green shadow-playful-green hover:scale-[1.02] hover:rotate-1 active:scale-[0.98] active:rotate-0"
            }
            flex items-center justify-center gap-3
          `}
        >
          {isStarting ? (
            <>
              <span className="inline-block animate-spin rounded-full h-6 w-6 border-3 border-white/30 border-t-white"></span>
              <span>Iniciant votació...</span>
            </>
          ) : (
            <>
              <span className="text-2xl">🎨</span>
              <span>Començar votació</span>
            </>
          )}
        </button>

        {!sidePanelClient && (
          <div className="text-center mt-4">
            <div className="inline-flex items-center gap-2 font-body text-text-secondary">
              <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-crayon-blue/30 border-t-crayon-blue"></span>
              Inicialitzant...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
