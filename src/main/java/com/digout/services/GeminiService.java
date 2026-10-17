package com.digout.services;

import com.digout.dto.WhoAssessmentDTO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class GeminiService {

    private static final Logger log = LoggerFactory.getLogger(GeminiService.class);

    private final String geminiApiKey;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final GroqService groqService;

    private static final String GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions?key=";
    private static final String PROMPT = "Analyze this image. FIRST, determine if the image contains a food item, dish, beverage, or packaged consumable. If a hand/person is visible holding or interacting with food, IGNORE the person and focus on the food. Err on the side of recognizing food (e.g., exotic dishes, raw ingredients, or packaged boxes). If the image is CLEARLY a non-food item (e.g., just a bare hand, a laptop, a table) with NO food in focus, output exactly: { \"isFood\": false, \"productName\": \"Not Food\", \"ingredientsFound\": [], \"whoFlags\": [], \"overallIndicator\": \"NOT_FOOD\", \"recommendedServingAdvice\": \"Please capture a food item.\", \"healthScore\": null }. OTHERWISE, set \"isFood\": true and proceed: IF YOU CAN CLEARLY READ THE INGREDIENTS LIST: Extract every ingredient, evaluate against WHO guidelines and USER PROFILE (if any). Statuses: GREEN, YELLOW, RED, PURPLE, BLACK. For each ingredient and WHO flag, include 'dailyLimit' (e.g., 'Max 25g/day (WHO)', 'Max 2000mg sodium/day', '0g / Avoid' - null if not applicable). IF the image contains the backside nutrition table or exact quantities/percentages, calculate 'productAmount' comparing this product's amount vs the daily limit (e.g. '18g per serving (72% of daily limit)', 'Exceeds daily limit (+120%)', or 'Within daily limit'); OTHERWISE set 'productAmount' to null. Calculate a tailored 'healthScore' (Integer from 0 to 100): 80-100 (GREEN: healthy, whole food/low processing, within limits), 55-79 (YELLOW: moderate processing or sodium/sugar), 30-54 (RED: ultra-processed, high hazard/sugar/sodium), 0-29 (PURPLE: severe hazard or contraindicated for user's medical condition/pregnancy/dietary profile - MUST be capped below 30 if PURPLE). RULES: (1) SYNTHETIC ADDITIVES & FORMULATION PENALTIES ACROSS ALL FACTORS: Formulations using Palm Oil, Palm Olein, or Interesterified Palm Fat must receive a strict RED penalty due to high saturated fatty acids (~50%) and cardiovascular risk (sweets/desserts with palm fat capped <= 35). Formulations containing High Fructose Corn Syrup (HFCS/Glucose-Fructose Syrup), Petroleum-derived Synthetic Dyes (Red 40, Tartrazine/Yellow 5, Yellow 6, Blue 1), Synthetic Chemical Preservatives (TBHQ, BHA, BHT), Partially Hydrogenated Trans Fats, Prohibited Additives (Potassium Bromate, Azodicarbonamide, Titanium Dioxide E171), or Chemically Bleached Flour must receive strict RED penalties and substantial score deductions vs cleaner/natural alternatives. (2) Standardize INS/E codes (INS 471 / E471 = YELLOW caution; INS 330 / E330 citric acid = GREEN). (3) Maintain strict sub-variant fidelity for 'globalEquivalent' (Regular <-> Regular, Diet <-> Diet). Output JSON exactly matching: { \"isFood\": true, \"productName\": \"String\", \"globalEquivalent\": \"String\", \"servingSize\": \"String\", \"quantity\": \"String\", \"ingredientsFound\": [ { \"name\": \"String\", \"explanation\": \"String\", \"status\": \"String\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"String\", \"explanation\": \"String\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"overallIndicator\": \"String\", \"personalizedAlerts\": [ { \"title\": \"String\", \"explanation\": \"String\", \"severity\": \"PURPLE or RED or YELLOW or GREEN\" } ], \"recommendedServingAdvice\": \"String\", \"healthScore\": 75 }.\n\nIF NO INGREDIENTS ARE LEGIBLE (e.g., this is just a photo of the front of the packaging): DO NOT evaluate anything. Instead, identify the product brand and name, and output a JSON with NO ingredients, exactly matching: { \"isFood\": true, \"productName\": \"Identified Brand and Flavor Name\", \"ingredientsFound\": [], \"overallIndicator\": \"BLACK\", \"recommendedServingAdvice\": \"Needs Database Lookup\", \"healthScore\": null }. DO NOT output <think> tags.";
    private static final String TEXT_PROMPT = "The user is asking for the health assessment of a product named: <productName>%s</productName>. We have retrieved the following exact ingredients from the database: <ingredients>%s</ingredients>. Evaluate these EXACT ingredients against WHO guidelines and the provided USER HEALTH PROFILE (if any). RULES: 1. Statuses can be GREEN (safe), YELLOW (caution), RED (high health risk), PURPLE (HIGHLY NOT RECOMMENDED / strictly contraindicated for user's medical condition, pregnancy, or severe calorie mismatch), BLACK (unknown). 2. For pregnancy/lactation (APPLY ONLY IF USER PROFILE EXPLICITLY LISTS PREGNANCY AND GENDER IS FEMALE; NEVER FOR MALE USERS), flag high caffeine, unpasteurized items, saccharin, and harmful additives as PURPLE. For ulcers/GERD, flag chili/spices as PURPLE/RED. For diabetes, flag sucrose/high sugar as PURPLE/RED. 3. For each ingredient and WHO flag, provide 'dailyLimit' (WHO/dietary daily limit, e.g. 'Max 25g/day (WHO)', 'Max 2000mg sodium/day', '0g / Avoid'). If exact quantities or percentages are present in the provided ingredients, provide 'productAmount' comparing it to the daily limit (e.g. '15g per serving (60%% of daily limit)' or 'Exceeds daily limit (+110%%)'); otherwise set 'productAmount' to null. 4. Formulate a tailored 'recommendedServingAdvice' based on user calorie goal and health profile. 5. Calculate a tailored 'healthScore' (Integer from 0 to 100): 80-100 (GREEN: wholesome/safe), 55-79 (YELLOW: moderate caution), 30-54 (RED: high health risk/unhealthy), 0-29 (PURPLE: severe hazard or contraindicated for user health profile). CRITICAL: If any ingredient is contraindicated for the user's active health profile, you MUST penalize and cap 'healthScore' below 30 (0 to 29). 6. TRANSLATION RULE: If the ingredients are in a foreign language (e.g., German, French, Spanish), you MUST translate them to English. However, you MUST preserve native cultural ingredient names (e.g., Maida, Ghee, Kimchi, Masa Harina). Do not output raw foreign terms like 'Weizenmehl', translate it to 'Wheat Flour'. 7. INGREDIENT STANDARDIZATION & NUTRITIONAL CONSISTENCY: (a) INS codes and E-numbers are identical international standards (e.g., INS 471 is E471, INS 330 is E330). Standard food emulsifiers (INS 471 / E471) must be evaluated with consistent status (YELLOW caution) and citric acid (INS 330 / E330) as GREEN across both domestic and international variants. (b) Refined starches and flours (corn flour, rice flour, maida, wheat starch) are refined carbohydrates and must consistently be evaluated as YELLOW. (c) Table salt listed without high percentage or milligram amounts must be consistently evaluated as moderate caution (YELLOW). (d) Non-Sugar Sweeteners (Aspartame, Sucralose, Acesulfame Potassium, Stevia) are non-caloric sugar substitutes: per WHO guidelines, they are not recommended for routine hydration or weight management, but avoid sugar calories; consistently evaluate NSS as moderate caution (YELLOW, health score 55-65), NEVER as RED unless specifically contraindicated (e.g. PKU for Aspartame). 8. FORMULATION & SYNTHETIC ADDITIVE PENALTIES ACROSS ALL FACTORS: (a) Oil & Fat Quality: Formulations relying on Palm Oil, Palm Olein, Interesterified Fats, or Partially Hydrogenated Oils (Trans Fats) must receive a strict RED penalty due to high saturated fatty acids (~50%%) and cardiovascular risk; ultra-processed sweets/desserts using palm fat must be strictly capped <= 35, and a palm oil formulation must NEVER receive a higher health score than a formulation using sunflower, olive, or unsaturated vegetable oils. Partially hydrogenated fats/trans fats must cap healthScore < 30. (b) Sweeteners: Formulations using High Fructose Corn Syrup (HFCS), Glucose-Fructose Syrup, or Isoglucose must receive a strict RED penalty and score deduction vs natural cane sugar or sucrose due to hepatic lipid accumulation. (c) Synthetic Dyes: Petroleum-derived artificial food colors (Red 40 / Allura Red, Tartrazine / Yellow 5, Sunset Yellow / Yellow 6, Blue 1, Blue 2, Red 3, INS 102/110/129/133) must receive a strict RED penalty vs natural plant extracts (paprika, beet, turmeric). (d) Synthetic Preservatives: TBHQ, BHA, and BHT (INS 319, 320, 321) must receive a strict RED penalty vs natural tocopherols (Vitamin E) or clean preservation. (e) Prohibited Additives & Bleached Flour: Potassium Bromate (E924), Azodicarbonamide (E927a), Titanium Dioxide (E171), and chemically bleached flour must receive strict RED/PURPLE penalties and score caps <= 30. (f) Concentrated Flavor Enhancers: MSG and synthetic ribonucleotides (E621, E631, E627) must receive penalty deductions vs natural spices and herbs. Formulations carrying more synthetic risk factors across ANY of these categories must ALWAYS score strictly lower than cleaner formulations of the same food. 9. UNIVERSAL VARIANT FIDELITY: When outputting 'globalEquivalent', you MUST strictly preserve the product's exact sub-variant across all dimensions (Sweetness: Regular <-> Regular, Zero/Diet <-> Zero/Diet; Fat: Whole <-> Whole, Skim <-> Skim; Sodium: Salted <-> Salted, Low-Sodium <-> Low-Sodium; Caffeine: Regular <-> Regular, Decaf <-> Decaf; Cooking: Fried <-> Fried, Baked <-> Baked; Flavors: Original/Plain <-> Original/Plain). NEVER substitute a regular/full-sugar product with a diet, zero, baked, decaf, or differently flavored variant. If analyzing a regular product like '7Up' or 'Red Bull', its globalEquivalent MUST be '7Up' or 'Red Bull' (NOT '7Up Free', 'Diet 7Up', 'Red Bull Sugarfree', etc.). 10. DO NOT output reasoning or <think> tags. Output a raw JSON object exactly matching this structure: { \"isFood\": true, \"productName\": \"String\", \"globalEquivalent\": \"String\", \"servingSize\": \"String (leave null if unknown)\", \"quantity\": \"String (leave null if unknown)\", \"ingredientsFound\": [ { \"name\": \"String (ingredient name + EXACT %% or amount if present)\", \"explanation\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"explanation\": \"String\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"overallIndicator\": \"PURPLE or RED or YELLOW or GREEN\", \"personalizedAlerts\": [ { \"title\": \"String\", \"explanation\": \"String\", \"severity\": \"PURPLE or RED or YELLOW or GREEN\" } ], \"recommendedServingAdvice\": \"String\", \"healthScore\": 75 }.";

    private static final String[] GEMINI_MODELS = {
            "gemini-3.5-flash",    // Fast, ultra-responsive model (tested 200 OK)
            "gemini-3.6-flash",    // Flagship reasoning fallback
            "gemini-flash-latest", // Evergreen fallback
            "gemini-3-flash-preview"
    };

    public GeminiService(@Value("${gemini.api.key}") String geminiApiKey, RestTemplate restTemplate, ObjectMapper objectMapper, GroqService groqService) {
        this.geminiApiKey = geminiApiKey;
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
        this.groqService = groqService;
    }

    private ResponseEntity<String> executeWithModelFallback(HttpHeaders headers, java.util.function.Function<String, java.util.Map<String, Object>> payloadBuilder) {
        Exception lastException = null;
        for (String model : GEMINI_MODELS) {
            try {
                java.util.Map<String, Object> payload = payloadBuilder.apply(model);
                HttpEntity<java.util.Map<String, Object>> request = new HttpEntity<>(payload, headers);
                return restTemplate.postForEntity(GEMINI_API_URL + geminiApiKey, request, String.class);
            } catch (org.springframework.web.client.HttpStatusCodeException e) {
                log.warn("Gemini model '{}' returned HTTP {}: {}. Upgrading to next model...", model, e.getStatusCode(), e.getResponseBodyAsString());
                lastException = e;
            } catch (Exception e) {
                log.warn("Gemini model '{}' failed ({}: {}). Upgrading to next model...", model, e.getClass().getSimpleName(), e.getMessage());
                lastException = e;
            }
        }
        throw new RuntimeException("All fallback Gemini models failed.", lastException);
    }

    @Async
    public CompletableFuture<WhoAssessmentDTO> analyzeIngredients(String base64Image, String mimeType, String foodCategory, String userProfileSummary, String language) {
        int maxRetries = 3;
        for (int i = 0; i < maxRetries; i++) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);

                String currentPrompt = PROMPT;
                if ("fresh".equals(foodCategory)) {
                    currentPrompt = currentPrompt.replace(
                        "IF NO INGREDIENTS ARE LEGIBLE (e.g., this is just a photo of the front of the packaging): DO NOT evaluate anything. Instead, identify the product brand and name, and output a JSON with NO ingredients, exactly matching: { \"isFood\": true, \"productName\": \"Identified Brand and Flavor Name\", \"ingredientsFound\": [], \"overallIndicator\": \"BLACK\", \"recommendedServingAdvice\": \"Needs Database Lookup\", \"healthScore\": null }.",
                        "CRITICAL OVERRIDE FOR FRESH FOOD: Since this is a photo of fresh food or a dish, there are no ingredient labels. You MUST visually identify the food/dish (e.g., 'Upma', 'Apple', 'Grilled Salmon') and ESTIMATE its standard ingredients based on your culinary knowledge base. Output the full evaluation and health score using these estimated ingredients. State its place of origin in the explanation if applicable."
                    );
                }
                if (userProfileSummary != null && !userProfileSummary.isBlank()) {
                    currentPrompt += " <userProfile>" + userProfileSummary + "</userProfile>. Tailor the evaluation, flags, PURPLE status, and recommended serving to this profile.";
                }
                
                // Add language constraint
                if (language != null && !language.equalsIgnoreCase("English")) {
                    currentPrompt += "\n\nCRITICAL LANGUAGE CONSTRAINT: The JSON keys must remain in English, but ALL TEXT VALUES (explanations, product names, warnings, etc.) MUST be written in " + language + ".";
                }

                final String finalPrompt = currentPrompt;
                ResponseEntity<String> response = executeWithModelFallback(headers, model -> Map.of(
                        "model", model,
                        "store", false,
                        "input", List.of(
                                Map.of(
                                        "type", "text",
                                        "text", finalPrompt
                                ),
                                Map.of(
                                        "type", "image",
                                        "mime_type", mimeType,
                                        "data", base64Image
                                )
                        )
                ));

                // Parse the response
                if (response.getBody() == null || response.getBody().isBlank()) {
                    throw new RuntimeException("Empty response body from Gemini API");
                }
                JsonNode root = objectMapper.readTree(response.getBody());
                if (root == null) {
                    throw new RuntimeException("Malformed response body from Gemini API");
                }
                JsonNode steps = root.path("steps");
                String jsonText = "";
                
                for (JsonNode step : steps) {
                    if ("model_output".equals(step.path("type").asText()) && step.has("content")) {
                        JsonNode contentArray = step.path("content");
                        if (contentArray.isArray() && contentArray.size() > 0) {
                            JsonNode firstContent = contentArray.get(0);
                            if (firstContent.has("text")) {
                                jsonText = firstContent.path("text").asText();
                                break;
                            }
                        }
                    } else if (step.has("modelOutput") && step.path("modelOutput").has("text")) {
                        // Fallback for mock responses or older schema
                        jsonText = step.path("modelOutput").path("text").asText();
                        break;
                    }
                }

                if (jsonText == null || jsonText.trim().isEmpty()) {
                    throw new RuntimeException("No model_output found in response: " + response.getBody());
                }

                jsonText = extractJson(jsonText);
                return CompletableFuture.completedFuture(parseAssessment(jsonText));
            } catch (Exception e) {
                if (e.getMessage() != null && (e.getMessage().contains("503") || e.getMessage().toLowerCase().contains("timed out") || e.getMessage().toLowerCase().contains("timeout")) && i < maxRetries - 1) {
                    try {
                        log.warn("Gemini Overload or Timeout! Retrying in 2s... (Attempt {}/{})", i + 1, maxRetries);
                        Thread.sleep(2000); // wait 2 seconds before retrying
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                    continue;
                } else if (e.getMessage() != null && e.getMessage().contains("429")) {
                     log.warn("Gemini Rate Limit reached! Falling back to GroqService...");
                     return groqService.analyzeIngredients(base64Image, mimeType, foodCategory, userProfileSummary, language);
                }
                
                log.warn("Gemini failed, falling back to GroqService: {}", e.getMessage());
                return groqService.analyzeIngredients(base64Image, mimeType, foodCategory, userProfileSummary, language);
            }
        }
        log.warn("Gemini exhausted retries, falling back to GroqService...");
        return groqService.analyzeIngredients(base64Image, mimeType, foodCategory, userProfileSummary, language);
    }

    @Async
    public CompletableFuture<WhoAssessmentDTO> analyzeIngredientsByName(String productName, String ingredientsText, String servingSize, String quantity, String foodCategory, String userProfileSummary, String language, boolean useFastModel) {
        if (useFastModel) {
            try {
                return groqService.analyzeIngredientsByName(productName, ingredientsText, servingSize, quantity, foodCategory, userProfileSummary, language, true)
                        .handle((res, ex) -> {
                            if (ex != null) {
                                log.warn("Fast model via Groq failed ({}), falling back to Gemini model...", ex.getMessage());
                                return analyzeIngredientsByName(productName, ingredientsText, servingSize, quantity, foodCategory, userProfileSummary, language, false);
                            }
                            return CompletableFuture.completedFuture(res);
                        }).thenCompose(f -> f);
            } catch (Exception ex) {
                log.warn("Fast model via Groq threw exception ({}), falling back to Gemini model...", ex.getMessage());
            }
        }
        int maxRetries = 3;
        for (int i = 0; i < maxRetries; i++) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);

                String formattedPrompt;
                if (ingredientsText == null || ingredientsText.isBlank()) {
                    formattedPrompt = "The user is asking for the health assessment of a product named: <productName>" + productName + "</productName>. We DO NOT have database ingredients for this, so you MUST use your internal knowledge base to identify this product and assume its standard ingredients. ";
                    if ("fresh".equals(foodCategory)) {
                        formattedPrompt += "This is a fresh or prepared food (like a local dish, fruit, or homemade meal). If it is a local/regional dish, please state its place of origin in the explanation. ";
                    } else {
                        formattedPrompt += "If this is a regional packaged product, identify the most popular global equivalent and use THAT product's ingredients instead, setting 'globalEquivalent'. ";
                    }
                    formattedPrompt += "Evaluate the ingredients against WHO guidelines and the provided USER HEALTH PROFILE. RULES: 1. Statuses: GREEN (safe), YELLOW (moderate), RED (avoid), PURPLE (HIGHLY NOT RECOMMENDED / strictly contraindicated for user conditions/pregnancy/calorie goal), BLACK (unknown). 2. For pregnancy, flag caffeine >200mg, raw/unpasteurized items, saccharin as PURPLE. For ulcers, flag chili/spices as PURPLE or RED. For diabetes, flag sugar as PURPLE or RED. 3. For each ingredient and WHO flag, include 'dailyLimit' (e.g. 'Max 25g/day (WHO)'). Since exact quantities are not available in this mode, set 'productAmount' to null. 4. Suggest a safe 'recommendedServingAdvice' (or '0 - Strictly Avoid' if PURPLE). 5. Calculate a tailored 'healthScore' (Integer from 0 to 100): 80-100 (GREEN), 55-79 (YELLOW), 30-54 (RED), 0-29 (PURPLE/contraindicated). If contraindicated for user profile, cap 'healthScore' below 30. 6. FORMULATION & SYNTHETIC ADDITIVE PENALTIES ACROSS ALL FACTORS: INS and E-numbers are identical (INS 471 is E471). Formulations using Palm Oil, HFCS, Synthetic Petroleum Dyes (Red 40, Yellow 5), Synthetic Preservatives (TBHQ/BHA/BHT), Trans Fats, or Banned Additives (Bromate, E171) must receive strict RED penalties and cannot score higher than cleaner formulations using unsaturated oils, cane sugar, or natural ingredients. 7. UNIVERSAL VARIANT FIDELITY: When identifying 'globalEquivalent', you MUST strictly preserve the product's exact sub-variant across all dimensions (Sweetness, Fat, Sodium, Caffeine, Cooking method, Flavors). NEVER substitute a regular/full-sugar product with a diet, zero, baked, or decaf variant. 8. DO NOT output reasoning or <think> tags. Output a raw JSON object exactly matching: { \"isFood\": true, \"productName\": \"String\", \"globalEquivalent\": \"String\", \"servingSize\": \"String (leave null if unknown)\", \"quantity\": \"String (leave null if unknown)\", \"ingredientsFound\": [ { \"name\": \"String (ingredient name ONLY, no estimated amounts)\", \"explanation\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"dailyLimit\": \"String or null\", \"productAmount\": null } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"explanation\": \"String\", \"dailyLimit\": \"String or null\", \"productAmount\": null } ], \"overallIndicator\": \"PURPLE or RED or YELLOW or GREEN\", \"personalizedAlerts\": [ { \"title\": \"String\", \"explanation\": \"String\", \"severity\": \"PURPLE or RED or YELLOW or GREEN\" } ], \"recommendedServingAdvice\": \"String\", \"healthScore\": 75 }.";
                } else {
                    formattedPrompt = String.format(TEXT_PROMPT, productName, ingredientsText);
                    if ("fresh".equals(foodCategory)) {
                        formattedPrompt += " Note: This is a fresh or prepared food. If it's a local dish, mention its place of origin in the explanation.";
                    }
                }

                if (userProfileSummary != null && !userProfileSummary.isBlank()) {
                    formattedPrompt += " <userProfile>" + userProfileSummary + "</userProfile>. Tailor the evaluation, flags, PURPLE status, and recommended serving to this profile.";
                }
                
                // Add language constraint
                if (language != null && !language.equalsIgnoreCase("English")) {
                    formattedPrompt += "\n\nCRITICAL LANGUAGE CONSTRAINT: The JSON keys must remain in English, but ALL TEXT VALUES (explanations, product names, warnings, etc.) MUST be written in " + language + ".";
                }
                
                final String finalFormattedPrompt = formattedPrompt;
                ResponseEntity<String> response = executeWithModelFallback(headers, model -> Map.of(
                        "model", model,
                        "store", false,
                        "input", List.of(
                                Map.of(
                                        "type", "text",
                                        "text", finalFormattedPrompt
                                )
                        )
                ));

                // Parse the response
                if (response.getBody() == null || response.getBody().isBlank()) {
                    throw new RuntimeException("Empty response body from Gemini API");
                }
                JsonNode root = objectMapper.readTree(response.getBody());
                if (root == null) {
                    throw new RuntimeException("Malformed response body from Gemini API");
                }
                JsonNode steps = root.path("steps");
                String jsonText = "";

                for (JsonNode step : steps) {
                    if ("model_output".equals(step.path("type").asText()) && step.has("content")) {
                        JsonNode contentArray = step.path("content");
                        if (contentArray.isArray() && contentArray.size() > 0) {
                            JsonNode firstContent = contentArray.get(0);
                            if (firstContent.has("text")) {
                                jsonText = firstContent.path("text").asText();
                                break;
                            }
                        }
                    } else if (step.has("modelOutput") && step.path("modelOutput").has("text")) {
                        jsonText = step.path("modelOutput").path("text").asText();
                        break;
                    }
                }

                if (jsonText == null || jsonText.trim().isEmpty()) {
                    throw new RuntimeException("No model_output found in response: " + response.getBody());
                }

                jsonText = extractJson(jsonText);
                WhoAssessmentDTO parsed = parseAssessment(jsonText);
                WhoAssessmentDTO augmented = new WhoAssessmentDTO(
                    parsed.isFood() != null ? parsed.isFood() : true,
                    parsed.productName(),
                    parsed.ingredientsFound(),
                    parsed.whoFlags(),
                    parsed.overallIndicator(),
                    parsed.globalEquivalent(),
                    servingSize != null ? servingSize : parsed.servingSize(),
                    quantity != null ? quantity : parsed.quantity(),
                    null,
                    parsed.personalizedAlerts(),
                    parsed.recommendedServingAdvice(),
                    parsed.healthScore()
                );
                return CompletableFuture.completedFuture(augmented);
            } catch (Exception e) {
                if (e.getMessage() != null && (e.getMessage().contains("503") || e.getMessage().toLowerCase().contains("timed out") || e.getMessage().toLowerCase().contains("timeout")) && i < maxRetries - 1) {
                    try {
                        log.warn("Gemini Overload or Timeout! Retrying in 2s... (Attempt {}/{})", i + 1, maxRetries);
                        Thread.sleep(2000);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                    continue;
                } else if (e.getMessage() != null && e.getMessage().contains("429")) {
                     log.warn("Gemini Rate Limit reached! Falling back to GroqService for name analysis...");
                    return groqService.analyzeIngredientsByName(productName, ingredientsText, servingSize, quantity, foodCategory, userProfileSummary, language, false);
                }
                log.warn("Gemini failed for name analysis, falling back to GroqService: {}", e.getMessage());
                return groqService.analyzeIngredientsByName(productName, ingredientsText, servingSize, quantity, foodCategory, userProfileSummary, language, false);
            }
        }
        log.warn("Gemini exhausted retries for name analysis, falling back to GroqService...");
        return groqService.analyzeIngredientsByName(productName, ingredientsText, servingSize, quantity, foodCategory, userProfileSummary, language, false);
    }

    private WhoAssessmentDTO parseAssessment(String rawJson) throws Exception {
        try {
            return objectMapper.readValue(rawJson, WhoAssessmentDTO.class);
        } catch (Exception parseEx) {
            log.warn("Gemini JSON parse failed, attempting automatic repair on truncated response: {}", parseEx.getMessage());
            String repaired = repairTruncatedJson(rawJson);
            return objectMapper.readValue(repaired, WhoAssessmentDTO.class);
        }
    }

    private String repairTruncatedJson(String text) {
        if (text == null || text.isBlank()) return "{}";
        int firstBrace = text.indexOf('{');
        if (firstBrace == -1) return "{}";
        String s = text.substring(firstBrace).trim();

        boolean inString = false;
        boolean escaped = false;
        java.util.Deque<Character> stack = new java.util.ArrayDeque<>();

        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (escaped) { escaped = false; continue; }
            if (c == '\\') { escaped = true; continue; }
            if (c == '"') { inString = !inString; continue; }
            if (!inString) {
                if (c == '{' || c == '[') {
                    stack.push(c);
                } else if (c == '}' && !stack.isEmpty() && stack.peek() == '{') {
                    stack.pop();
                } else if (c == ']' && !stack.isEmpty() && stack.peek() == '[') {
                    stack.pop();
                }
            }
        }

        StringBuilder sb = new StringBuilder(s);
        if (inString) {
            sb.append('"');
        }

        String current = sb.toString().trim();
        while (current.endsWith(",") || current.endsWith(":")) {
            current = current.substring(0, current.length() - 1).trim();
        }
        sb = new StringBuilder(current);

        stack.clear();
        inString = false;
        escaped = false;
        for (int i = 0; i < sb.length(); i++) {
            char c = sb.charAt(i);
            if (escaped) { escaped = false; continue; }
            if (c == '\\') { escaped = true; continue; }
            if (c == '"') { inString = !inString; continue; }
            if (!inString) {
                if (c == '{' || c == '[') stack.push(c);
                else if (c == '}' && !stack.isEmpty() && stack.peek() == '{') stack.pop();
                else if (c == ']' && !stack.isEmpty() && stack.peek() == '[') stack.pop();
            }
        }

        while (!stack.isEmpty()) {
            char open = stack.pop();
            if (open == '{') sb.append("}");
            else if (open == '[') sb.append("]");
        }

        return sb.toString();
    }

    private static final java.util.regex.Pattern JSON_EXTRACT_PATTERN = 
            java.util.regex.Pattern.compile("\\{.*\\}", java.util.regex.Pattern.DOTALL);

    private String extractJson(String rawText) {
        if (rawText == null) return "";
        java.util.regex.Matcher matcher = JSON_EXTRACT_PATTERN.matcher(rawText);
        if (matcher.find()) {
            return matcher.group();
        }
        return rawText;
    }

    public com.digout.dto.OpenFoodFactsDTO getIngredientsDatabaseFallback(String productName) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            String safeName = productName != null ? productName.replace("'", "").replace("\"", "").replace("\n", " ").trim() : "";
            String dbPrompt = "You are a product ingredient database. The user is searching for '" + safeName + "'. Output a JSON object containing 'product_name' and 'ingredients_text' (a comma separated string of typical ingredients for the global/popular version of this product) based on your knowledge. Output RAW JSON ONLY.";
            
            ResponseEntity<String> response = executeWithModelFallback(headers, model -> Map.of(
                    "model", model,
                    "store", false,
                    "input", List.of(
                            Map.of("type", "text", "text", dbPrompt)
                    )
            ));

            JsonNode root = objectMapper.readTree(response.getBody());
            JsonNode steps = root.path("steps");
            String jsonText = "";

            for (JsonNode step : steps) {
                if (("model_output".equals(step.path("type").asText()) || step.has("modelOutput")) && (step.has("content") || step.path("modelOutput").has("text"))) {
                    if (step.has("content")) {
                        JsonNode contentNode = step.path("content");
                        if (contentNode.isArray() && contentNode.size() > 0) {
                            jsonText = contentNode.get(0).path("text").asText();
                        }
                    } else {
                         jsonText = step.path("modelOutput").path("text").asText();
                    }
                    break;
                }
            }
            jsonText = extractJson(jsonText);
            JsonNode parsedJson = objectMapper.readTree(jsonText);
            return new com.digout.dto.OpenFoodFactsDTO(
                parsedJson.path("product_name").asText(productName),
                parsedJson.path("ingredients_text").asText(""),
                null,
                null,
                null
            );
        } catch (Exception e) {
            throw new RuntimeException("Fallback database AI failed: " + e.getMessage(), e);
        }
    }
}
