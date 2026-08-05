GEMINI_STANDARD_PRICING = {
    'gemini-3.6-flash': {'input_per_1m': 1.50, 'output_per_1m': 7.50, 'grounding_mode': 'search_query', 'grounding_unit_cost': 14 / 1000},
    'gemini-3.5-flash': {'input_per_1m': 1.50, 'output_per_1m': 9.00, 'grounding_mode': 'search_query', 'grounding_unit_cost': 14 / 1000},
    'gemini-3.5-flash-lite': {'input_per_1m': 0.30, 'output_per_1m': 2.50, 'grounding_mode': 'search_query', 'grounding_unit_cost': 14 / 1000},
    'gemini-3.1-flash-lite': {'input_per_1m': 0.25, 'output_per_1m': 1.50, 'grounding_mode': 'search_query', 'grounding_unit_cost': 14 / 1000},
    'gemini-3-flash-preview': {'input_per_1m': 0.75, 'output_per_1m': 3.75, 'grounding_mode': 'search_query', 'grounding_unit_cost': 14 / 1000},
    'gemini-3-preview': {'input_per_1m': 0.75, 'output_per_1m': 3.75, 'grounding_mode': 'search_query', 'grounding_unit_cost': 14 / 1000},
    'gemini-2.5-flash': {'input_per_1m': 0.30, 'output_per_1m': 2.50, 'grounding_mode': 'grounded_prompt', 'grounding_unit_cost': 35 / 1000},
    'gemini-2.5-flash-lite': {'input_per_1m': 0.10, 'output_per_1m': 0.40, 'grounding_mode': 'grounded_prompt', 'grounding_unit_cost': 35 / 1000},
}

REQUEST_TYPE_BRAND_DISTRIBUTOR_RESEARCH = 'brand_distributor_research'
REQUEST_TYPE_COLD_OUTREACH_TARGET_SEARCH = 'cold_outreach_target_search'
