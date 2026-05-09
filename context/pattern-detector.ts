/**
 * Agent Pattern Detector
 *
 * Heuristic classifier over plaintext chat transcripts. It is intentionally
 * fuzzy: false positives are reduced by narrowing keyword lists, but some
 * colloquial phrasing may still leak through. Tune patterns here—not call
 * sites—when calibration changes.
 */

import type { AgentMessage } from '../manager.js'
import type {
  EditingContext,
  NavigationContext,
  OptimizationSuggestion,
} from '../shared/intelligence-types.js'

/** Symbols shorter than this length are discarded as noise */
const MIN_SYMBOL_LENGTH = 3

export class AgentPatternDetector {
  /**
   * Verbs/phrases signalling code change intent when present in the fused
   * transcript (substring match).
   */
  private static readonly EDITING_KEYWORDS: readonly string[] = [
    'edit',
    'modify',
    'change',
    'update',
    'fix',
    'refactor',
    'add to',
    'remove from',
    'implement',
    'write',
  ]

  /**
   * Symbols extracted only after editing intent fires. Order is not semantics;
   * all patterns contribute to `targetSymbols` (union).
   */
  private static readonly EDITING_SYMBOL_PATTERNS = [
    {
      /** "edit the FooHandler class" … */
      name: 'editTargetQualifier',
      regex:
        /\b(?:edit|modify|change|update|fix|refactor)\s+(?:the\s+)?([\w]+)\s+(?:function|method|class|interface|logic|constructor|handler)\b/gi,
    },
    {
      name: 'implementation',
      regex: /\bimplement(?:ing)?\s+(?:the\s+)?([\w]+)\b/gi,
    },
    {
      name: 'pascalCase',
      regex: /\b([A-Z][a-z]+\w*[A-Z]\w*)\b/g,
    },
    {
      name: 'camelCase',
      regex: /\b([a-z]+[A-Z]\w*)\b/g,
    },
    {
      name: 'snakeCase',
      regex: /\b([a-z]+_[a-z]\w*)\b/g,
    },
    {
      /** `function authenticate` style */
      name: 'declarationKeyword',
      regex: /\b(?:function|class|interface|type)\s+([\w]+)\b/gi,
    },
  ] as const

  /** Common source extensions when paths appear verbatim in chat */
  private static readonly FILE_PATH_REGEX =
    /\b[\w./~-]+\.(?:ts|tsx|py|rs|js|jsx|mjs|cjs)\b/gi

  /**
   * Loose hashline-ish line-anchor tokens (e.g. `1tz`, `42ab`): one-or-more ASCII
   * digits immediately followed by two lowercase ASCII letters, as word token.
   * May collide with ordinal fragments in edge cases (`1st` as `\d+[a-z]{2}`); pair
   * with explicit `"hashline"` mention when tightening downstream guidance.
   */
  private static readonly HASHLINE_ID_PATTERN = /\b\d+[a-z]{2}\b/

  /** Standard-definition phrasing (“where is X”, “find the X”). */
  private static readonly NAV_DEFINITION_PHRASE = new RegExp(
    String.raw`\b(where\s+is|find\s+the|definition\s+of|locate)\b`,
  )

  /**
   * “find/where … <Symbol> is defined” without requiring “find the”—covers
   * queries like “find where User is defined …”.
   */
  private static readonly NAV_DEFINITION_SYMBOL_IS_DEFINED = new RegExp(
    String.raw`\b(?:find|where)\b[\s\S]{0,240}?\b([\w]+)\s+is\s+defined\b`,
    'i',
  )

  private static readonly NAV_REFERENCES = new RegExp(
    String.raw`\b(references\s+to|usages\s+of|called\s+from)\b|\bwhere\b[^.?]{0,120}\bused\b`,
  )

  /** File-discovery questions (narrow; excludes vague “tell me…” phrasing). */
  private static readonly NAV_FILE_LOCATION = new RegExp(
    String.raw`\b(which\s+file|what\s+file\s+contains|file\s+contains|file\s+location)\b`,
  )

  private static readonly NAV_SYMBOL_PATTERNS = [
    {
      name: 'navLeadIn',
      regex:
        /\b(?:where\s+is|find\s+the|definition\s+of|references\s+to|usages\s+of)\s+(?:the\s+)?([\w]+)\b/gi,
    },
    {
      name: 'theXClass',
      regex: /\bthe\s+([\w]+)\s+(?:class|interface|enum|type)\b/gi,
    },
    {
      name: 'namedType',
      regex:
        /\b([\w]+)\s+(?:class|interface|enum)(?:\s+defined|\s+(?:extends|implements))?\b/gi,
    },
    {
      name: 'pascalCase',
      regex: /\b([A-Z][a-z]+\w*[A-Z]\w*)\b/g,
    },
    {
      name: 'camelCase',
      regex: /\b([a-z]+[A-Z]\w*)\b/g,
    },
    {
      name: 'symbolIsDefined',
      regex: /\b([\w]+)\s+is\s+defined\b/gi,
    },
  ] as const

  /** Rough signal for prose that names StrReplace-like workflows */
  private static readonly STRREPLACE_OR_FILE_EDIT_SIGNAL = new RegExp(
    String.raw`strreplace|\b(?:str|string)\s+replace\b|edit\s+the\s+file\b`,
    'i',
  )

  /**
   * When the transcript suggests the participant is navigating by question
   * instead of LSP tooling. Kept narrower than conversational “tell me”.
   */
  private static mentionsManualFileLookup(content: string): boolean {
    return (
      content.includes('which file') ||
      content.includes('where is') ||
      content.includes('what file contains') ||
      content.includes('file location')
    )
  }

  /**
   * Signals tied to god-node discussions in pi-scope terminology (avoid generic
   * “critical/important”).
   */
  private static mentionsGraphGodNodeSignals(content: string): boolean {
    return (
      content.includes('god node') ||
      content.includes('high-impact symbol') ||
      content.includes('critical symbol')
    )
  }

  /**
   * True when wording suggests impact was actually weighed (narrower than a raw
   * `impact` substring so phrases like high-impact-symbol stay separate).
   */
  private static looksLikeImpactDiscussed(content: string): boolean {
    return (
      /\bimpact\s+(analysis|assessment|radius|of\s+changing)\b/.test(content) ||
      /\bounce\b.*\bimpact\b|\bimpact\b.*\b(risk|radius|scope|blast)\b/.test(content) ||
      content.includes('affects') ||
      content.includes('dependencies')
    )
  }

  /**
   * Detect when edits are likely planned from recent chat (“edit/fix/…”).
   * Limitations: keyword-only detection; slang may bypass or misfire.
   */
  detectEditingIntent(messages: AgentMessage[]): EditingContext {
    const recentMessages = messages.slice(-10)
    const preserved = recentMessages.map((m) => String(m.content || '')).join(' ')
    const contentLower = preserved.toLowerCase()

    const detected = AgentPatternDetector.EDITING_KEYWORDS.some((keyword) =>
      contentLower.includes(keyword),
    )

    if (!detected) {
      return {
        detected: false,
        targetSymbols: [],
        targetFiles: [],
        hasHashAnnotations: false,
        affectedGodNodes: [],
      }
    }

    const targetSymbols: string[] = []
    for (const { regex } of AgentPatternDetector.EDITING_SYMBOL_PATTERNS) {
      const g = regex.global
        ? regex
        : new RegExp(regex.source, `${regex.flags}g`)
      for (const match of preserved.matchAll(g)) {
        const symbol = match[1]
        if (symbol && symbol.length >= MIN_SYMBOL_LENGTH) targetSymbols.push(symbol)
      }
    }

    const targetFiles: string[] = []
    for (const match of preserved.matchAll(AgentPatternDetector.FILE_PATH_REGEX)) {
      targetFiles.push(match[0])
    }

    const lowerForHash = contentLower
    const hasHashAnnotations =
      lowerForHash.includes('hashline') ||
      AgentPatternDetector.HASHLINE_ID_PATTERN.test(lowerForHash)

    return {
      detected: true,
      targetSymbols: [...new Set(targetSymbols)],
      targetFiles: [...new Set(targetFiles)],
      hasHashAnnotations,
      affectedGodNodes: [],
    }
  }

  /**
   * Classify lookup intent (definition vs references vs which-file).
   * If multiple intents appear, earlier branches win: definition, then references,
   * then file location.
   */
  detectNavigationRequests(messages: AgentMessage[]): NavigationContext {
    const recentMessages = messages.slice(-5)
    const preserved = recentMessages.map((m) => String(m.content || '')).join(' ')
    const content = preserved.toLowerCase()

    let requestType: NavigationContext['requestType'] = 'none'
    let detected = false

    if (
      AgentPatternDetector.NAV_DEFINITION_PHRASE.test(content) ||
      AgentPatternDetector.NAV_DEFINITION_SYMBOL_IS_DEFINED.test(preserved)
    ) {
      detected = true
      requestType = 'definition'
    } else if (AgentPatternDetector.NAV_REFERENCES.test(content)) {
      detected = true
      requestType = 'references'
    } else if (AgentPatternDetector.NAV_FILE_LOCATION.test(content)) {
      detected = true
      requestType = 'file_location'
    }

    if (!detected) {
      return {
        detected: false,
        requestedSymbols: [],
        requestType: 'none',
      }
    }

    const requestedSymbols: string[] = []
    for (const { regex } of AgentPatternDetector.NAV_SYMBOL_PATTERNS) {
      const g = regex.global
        ? regex
        : new RegExp(regex.source, `${regex.flags}g`)
      for (const match of preserved.matchAll(g)) {
        const symbol = match[1]
        if (symbol && symbol.length >= MIN_SYMBOL_LENGTH)
          requestedSymbols.push(symbol)
      }
    }

    return {
      detected: true,
      requestedSymbols: [...new Set(requestedSymbols)],
      requestType,
    }
  }

  /**
   * Surface steering hints when transcript suggests brittle editor habits.
   * Scans all roles in the trailing window (~15 msgs).
   */
  detectSuboptimalToolUsage(messages: AgentMessage[]): OptimizationSuggestion[] {
    const recentMessages = messages.slice(-15)
    const suggestions: OptimizationSuggestion[] = []

    const allContents = recentMessages.map((m) =>
      String(m.content || '').toLowerCase(),
    )

    const usesStrReplace = allContents.some((c) =>
      AgentPatternDetector.STRREPLACE_OR_FILE_EDIT_SIGNAL.test(c),
    )

    if (usesStrReplace) {
      const hasHashContent = allContents.some(
        (c) =>
          c.includes('hashline') ||
          AgentPatternDetector.HASHLINE_ID_PATTERN.test(c),
      )
      suggestions.push({
        type: 'tool_usage',
        pattern: 'basic_file_edit',
        recommendation: hasHashContent
          ? 'Use hashline_edit instead of StrReplace when hash-annotated content is available'
          : 'Prefer hashline_edit over StrReplace for hash-verified, line-accurate edits when annotations are present',
        confidence: hasHashContent ? 0.9 : 0.75,
        context: hasHashContent
          ? 'hash-annotated content available'
          : 'StrReplace-style bulk edit detected; hashline_edit reduces drift',
        toolSuggestion: 'hashline_edit',
      })
    }

    const asksForLocations = allContents.some((c) =>
      AgentPatternDetector.mentionsManualFileLookup(c),
    )

    if (asksForLocations) {
      suggestions.push({
        type: 'tool_usage',
        pattern: 'manual_navigation',
        recommendation:
          'Use lsp_go_to_definition or lsp_find_references instead of asking for file locations',
        confidence: 0.8,
        context: 'LSP tools available for navigation',
        toolSuggestion: 'lsp_go_to_definition',
      })
    }

    const mentionsGodNodes = allContents.some((c) =>
      AgentPatternDetector.mentionsGraphGodNodeSignals(c),
    )
    const lacksImpactAnalysis = !allContents.some((c) =>
      AgentPatternDetector.looksLikeImpactDiscussed(c),
    )

    if (mentionsGodNodes && lacksImpactAnalysis) {
      suggestions.push({
        type: 'context_awareness',
        pattern: 'missing_impact_analysis',
        recommendation: 'Consider impact analysis when editing god nodes or critical symbols',
        confidence: 0.7,
        context: 'god node mentioned without impact consideration',
      })
    }

    return suggestions
  }
}
