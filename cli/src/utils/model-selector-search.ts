export interface SearchableModelChoice {
  providerId: string | null
  providerName: string
  modelId: string
  modelName: string
}

export interface SearchableModelSection<
  TChoice extends SearchableModelChoice = SearchableModelChoice,
> {
  providerId: string | null
  providerName: string
  choices: TChoice[]
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
}

export function filterModelSections<
  TChoice extends SearchableModelChoice,
  TSection extends SearchableModelSection<TChoice>,
>(sections: TSection[], query: string): TSection[] {
  const tokens = normalizeSearchText(query).trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return sections

  return sections.flatMap((section) => {
    const providerSearchText = normalizeSearchText(
      `${section.providerName} ${section.providerId ?? ''}`,
    )

    const choices = section.choices.filter((choice) => {
      const choiceSearchText = normalizeSearchText(
        `${providerSearchText} ${choice.modelName} ${choice.modelId}`,
      )
      return tokens.every((token) => choiceSearchText.includes(token))
    })

    return choices.length > 0 ? [{ ...section, choices }] : []
  })
}
