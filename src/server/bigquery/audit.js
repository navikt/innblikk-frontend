function addAuditLogging(queryConfig, navIdent, analysisType = null) {
  const isDryRun = queryConfig.dryRun === true

  // Add NAV ident as a label (queryable metadata in BigQuery)
  queryConfig.labels = {
    ...queryConfig.labels,
    nav_ident: navIdent.toLowerCase().replace(/[^a-z0-9_-]/g, '_'), // Labels must be lowercase and alphanumeric
    user_type: 'internal',
    job_mode: isDryRun ? 'dry_run' : 'execution',
  }

  if (analysisType) {
    queryConfig.labels.analysis_type = analysisType.toLowerCase().replace(/[^a-z0-9_-]/g, '_')
  }

  // Add NAV ident as SQL comment (visible in query history)
  if (queryConfig.query && navIdent) {
    let comment = `-- Nav ident: ${navIdent}\n-- Timestamp: ${new Date().toISOString()}`
    if (isDryRun) {
      comment += `\n-- Mode: Dry Run`
    }
    if (analysisType) {
      comment += `\n-- Analysis: ${analysisType}`
    }
    queryConfig.query = `${comment}\n${queryConfig.query}`
  }

  return queryConfig
}

function getAnalysisTypeOverride(req, fallback) {
  const referer = typeof req?.headers?.referer === 'string' ? req.headers.referer : ''
  if (referer) {
    try {
      const url = new URL(referer)
      if (url.pathname === '/trafikkanalyse') return 'trafikkanalyse'
      if (url.pathname === '/markedsanalyse') return 'markedsanalyse'
    } catch {
      // Ignore invalid referer
    }
  }
  return fallback
}

const substituteQueryParameters = (query, params) => {
  if (!query || !params) return query

  let substitutedQuery = query

  // Sort keys by length (descending) to avoid partial replacement issues
  // e.g. replacing @url1 instead of @url10
  const keys = Object.keys(params).sort((a, b) => b.length - a.length)

  keys.forEach((key) => {
    const value = params[key]
    let stringValue

    if (typeof value === 'string') {
      // Check if it's likely a date (ISO) or number-as-string
      // But generally, strings should be quoted
      // Escape single quotes
      stringValue = `'${value.replace(/'/g, "\\'")}'`
    } else if (value instanceof Date) {
      stringValue = `'${value.toISOString()}'`
    } else if (value === null || value === undefined) {
      stringValue = 'NULL'
    } else {
      stringValue = String(value)
    }

    // Replace @key with value, ensuring word boundary
    // Note: BigQuery params start with @
    const regex = new RegExp(`@${key}\\b`, 'g')
    substitutedQuery = substitutedQuery.replace(regex, stringValue)
  })

  return substitutedQuery
}

export { addAuditLogging, getAnalysisTypeOverride, substituteQueryParameters }
