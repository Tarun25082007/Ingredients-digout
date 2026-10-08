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
public class GroqService {

    private static final Logger log = LoggerFactory.getLogger(GroqService.class);

    private final String groqApiKey;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    private static final String GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
    
    private static final String PROMPT = "Analyze this image. FIRST, determine if the image contains a food item, dish, beverage, or packaged consumable. If a hand/person is visible holding or interacting with food, IGNORE the person and focus on the food. Err on the side of recognizing food (e.g., exotic dishes, raw ingredients, or packaged boxes). If the image is CLEARLY a non-food item (e.g., just a bare hand, a laptop, a table) with NO food in focus, output exactly: { \"isFood\": false, \"productName\": \"Not Food\", \"ingredientsFound\": [], \"whoFlags\": [], \"overallIndicator\": \"NOT_FOOD\", \"recommendedServingAdvice\": \"Please capture a food item.\", \"healthScore\": null }. OTHERWISE, set \"isFood\": true and proceed: IF YOU CAN CLEARLY READ THE INGREDIENTS LIST: Extract every ingredient, evaluate against WHO guidelines and USER PROFILE (if any). Statuses: GREEN, YELLOW, RED, PURPLE, BLACK. For each ingredient and WHO flag, include 'dailyLimit' (e.g., 'Max 25g/day (WHO)', 'Max 2000mg sodium/day', '0g / Avoid' - null if not applicable). IF the image contains the backside nutrition table or exact quantities/percentages, calculate 'productAmount' comparing this product's amount vs the daily limit (e.g. '18g per serving (72% of daily limit)', 'Exceeds daily limit (+120%)', or 'Within daily limit'); OTHERWISE set 'productAmount' to null. Calculate a tailored 'healthScore' (Integer from 0 to 100): 80-100 (GREEN: healthy, whole food/low processing, within limits), 55-79 (YELLOW: moderate processing or sodium/sugar), 30-54 (RED: ultra-processed, high hazard/sugar/sodium), 0-29 (PURPLE: severe hazard or contraindicated for user's medical condition/pregnancy/dietary profile - MUST be capped below 30 if PURPLE). Output JSON exactly matching: { \"isFood\": true, \"productName\": \"String\", \"globalEquivalent\": \"String\", \"servingSize\": \"String\", \"quantity\": \"String\", \"ingredientsFound\": [ { \"name\": \"String\", \"explanation\": \"String\", \"status\": \"String\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"String\", \"explanation\": \"String\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"overallIndicator\": \"String\", \"personalizedAlerts\": [ { \"title\": \"String\", \"explanation\": \"String\", \"severity\": \"PURPLE or RED or YELLOW or GREEN\" } ], \"recommendedServingAdvice\": \"String\", \"healthScore\": 75 }.\n\nIF NO INGREDIENTS ARE LEGIBLE (e.g., this is just a photo of the front of the packaging): DO NOT evaluate anything. Instead, identify the product brand and name, and output a JSON with NO ingredients, exactly matching: { \"isFood\": true, \"productName\": \"Identified Brand and Flavor Name\", \"ingredientsFound\": [], \"overallIndicator\": \"BLACK\", \"recommendedServingAdvice\": \"Needs Database Lookup\", \"healthScore\": null }. DO NOT output <think> tags.";
    private static final String TEXT_PROMPT = "The user is asking for the health assessment of a product named: <productName>%s</productName>. We have retrieved the following exact ingredients from the database: <ingredients>%s</ingredients>. Evaluate these EXACT ingredients against WHO guidelines and the provided USER HEALTH PROFILE (if any). RULES: 1. Statuses can be GREEN (safe), YELLOW (caution), RED (high health risk), PURPLE (HIGHLY NOT RECOMMENDED / strictly contraindicated for user's medical condition, pregnancy, or severe calorie mismatch), BLACK (unknown). 2. For pregnancy/lactation (APPLY ONLY IF USER PROFILE EXPLICITLY LISTS PREGNANCY AND GENDER IS FEMALE; NEVER FOR MALE USERS), flag high caffeine, unpasteurized items, saccharin, and harmful additives as PURPLE. For ulcers/GERD, flag chili/spices as PURPLE/RED. For diabetes, flag sucrose/high sugar as PURPLE/RED. 3. For each ingredient and WHO flag, provide 'dailyLimit' (WHO/dietary daily limit, e.g. 'Max 25g/day (WHO)', 'Max 2000mg sodium/day', '0g / Avoid'). If exact quantities or percentages are present in the provided ingredients, provide 'productAmount' comparing it to the daily limit (e.g. '15g per serving (60%% of daily limit)' or 'Exceeds daily limit (+110%%)'); otherwise set 'productAmount' to null. 4. Formulate a tailored 'recommendedServingAdvice' based on user calorie goal and health profile. 5. Calculate a tailored 'healthScore' (Integer from 0 to 100): 80-100 (GREEN: wholesome/safe), 55-79 (YELLOW: moderate caution), 30-54 (RED: high health risk/unhealthy), 0-29 (PURPLE: severe hazard or contraindicated for user health profile). CRITICAL: If any ingredient is contraindicated for the user's active health profile, you MUST penalize and cap 'healthScore' below 30 (0 to 29). 6. TRANSLATION RULE: If the ingredients are in a foreign language (e.g., German, French, Spanish), you MUST translate them to English. However, you MUST preserve native cultural ingredient names (e.g., Maida, Ghee, Kimchi, Masa Harina). Do not output raw foreign terms like 'Weizenmehl', translate it to 'Wheat Flour'. 7. INGREDIENT STANDARDIZATION & NUTRITIONAL CONSISTENCY: (a) INS codes and E-numbers are identical international standards (e.g., INS 471 is E471, INS 330 is E330). Standard food emulsifiers (INS 471 / E471) must be evaluated with consistent status (YELLOW caution) and citric acid (INS 330 / E330) as GREEN across both domestic and international variants. (b) Refined starches and flours (corn flour, rice flour, maida, wheat starch) are refined carbohydrates and must consistently be evaluated as YELLOW. (c) Table salt listed without high percentage or milligram amounts must be consistently evaluated as moderate caution (YELLOW). (d) Non-Sugar Sweeteners (Aspartame, Sucralose, Acesulfame Potassium, Stevia) are non-caloric sugar substitutes: per WHO guidelines, they are not recommended for routine hydration or weight management, but avoid sugar calories; consistently evaluate NSS as moderate caution (YELLOW, health score 55-65), NEVER as RED unless specifically contraindicated (e.g. PKU for Aspartame). 8. FORMULATION & SYNTHETIC ADDITIVE PENALTIES ACROSS ALL FACTORS: (a) Oil & Fat Quality: Formulations relying on Palm Oil, Palm Olein, Interesterified Fats, or Partially Hydrogenated Oils (Trans Fats) must receive a strict RED penalty due to high saturated fatty acids (~50%%) and cardiovascular risk; ultra-processed sweets/desserts using palm fat must be strictly capped <= 35, and a palm oil formulation must NEVER receive a higher health score than a formulation using sunflower, olive, or unsaturated vegetable oils. Partially hydrogenated fats/trans fats must cap healthScore < 30. (b) Sweeteners: Formulations using High Fructose Corn Syrup (HFCS), Glucose-Fructose Syrup, or Isoglucose must receive a strict RED penalty and score deduction vs natural cane sugar or sucrose due to hepatic lipid accumulation. (c) Synthetic Dyes: Petroleum-derived artificial food colors (Red 40 / Allura Red, Tartrazine / Yellow 5, Sunset Yellow / Yellow 6, Blue 1, Blue 2, Red 3, INS 102/110/129/133) must receive a strict RED penalty vs natural plant extracts (paprika, beet, turmeric). (d) Synthetic Preservatives: TBHQ, BHA, and BHT (INS 319, 320, 321) must receive a strict RED penalty vs natural tocopherols (Vitamin E) or clean preservation. (e) Prohibited Additives & Bleached Flour: Potassium Bromate (E924), Azodicarbonamide (E927a), Titanium Dioxide (E171), and chemically bleached flour must receive strict RED/PURPLE penalties and score caps <= 30. (f) Concentrated Flavor Enhancers: MSG and synthetic ribonucleotides (E621, E631, E627) must receive penalty deductions vs natural spices and herbs. Formulations carrying more synthetic risk factors across ANY of these categories must ALWAYS score strictly lower than cleaner formulations of the same food. 9. UNIVERSAL VARIANT FIDELITY: When outputting 'globalEquivalent', you MUST strictly preserve the product's exact sub-variant across all dimensions (Sweetness: Regular <-> Regular, Zero/Diet <-> Zero/Diet; Fat: Whole <-> Whole, Skim <-> Skim; Sodium: Salted <-> Salted, Low-Sodium <-> Low-Sodium; Caffeine: Regular <-> Regular, Decaf <-> Decaf; Cooking: Fried <-> Fried, Baked <-> Baked; Flavors: Original/Plain <-> Original/Plain). NEVER substitute a regular/full-sugar product with a diet, zero, baked, decaf, or differently flavored variant. If analyzing a regular product like '7Up' or 'Red Bull', its globalEquivalent MUST be '7Up' or 'Red Bull' (NOT '7Up Free', 'Diet 7Up', 'Red Bull Sugarfree', etc.). 10. DO NOT output reasoning or <think> tags. Output a raw JSON object exactly matching this structure: { \"isFood\": true, \"productName\": \"String\", \"globalEquivalent\": \"String\", \"servingSize\": \"String (leave null if unknown)\", \"quantity\": \"String (leave null if unknown)\", \"ingredientsFound\": [ { \"name\": \"String (ingredient name + EXACT %% or amount if present)\", \"explanation\": \"String (health impact)\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"explanation\": \"String\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"overallIndicator\": \"PURPLE or RED or YELLOW or GREEN\", \"personalizedAlerts\": [ { \"title\": \"String\", \"explanation\": \"String\", \"severity\": \"PURPLE or RED or YELLOW or GREEN\" } ], \"recommendedServingAdvice\": \"String\", \"healthScore\": 75 }.";

    private static final String[] TEXT_MODELS = {
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "qwen/qwen3.8-27b"
    };

    private static final String[] VISION_MODELS = {
            "llama-3.2-11b-vision-preview",
            "llama-3.2-90b-vision-preview"
    };

    public GroqService(@Value("${groq.api.key}") String groqApiKey, RestTemplate restTemplate, ObjectMapper objectMapper) {
        this.groqApiKey = groqApiKey;
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
    }

    private String executeWithModelFallback(HttpHeaders headers, java.util.function.Function<String, java.util.Map<String, Object>> payloadBuilder, String[] models) {
        Exception lastException = null;
        for (String model : models) {
            try {
                java.util.Map<String, Object> payload = payloadBuilder.apply(model);
                if (!payload.containsKey("max_tokens")) {
                    java.util.Map<String, Object> newPayload = new java.util.HashMap<>(payload);
                    newPayload.put("max_tokens", 1500);
                    payload = newPayload;
                }
                HttpEntity<java.util.Map<String, Object>> request = new HttpEntity<>(payload, headers);
                ResponseEntity<String> response = restTemplate.postForEntity(GROQ_API_URL, request, String.class);
                return extractRawResponseText(response.getBody());
            } catch (org.springframework.web.client.HttpClientErrorException e) {
                String responseBody = e.getResponseBodyAsString();
                int status = e.getStatusCode().value();
                if (status == 400 || status == 404 || status == 429 
                        || responseBody.contains("model_decommissioned") 
                        || responseBody.contains("model_not_found") 
                        || responseBody.contains("not found") 
                        || responseBody.contains("not_found") 
                        || responseBody.contains("invalid model") 
                        || responseBody.contains("rate_limit_exceeded")) {
                    log.warn("Groq model '{}' failed or rate limited ({}). Response: {}. Automatically upgrading to next model...", model, e.getStatusCode(), responseBody);
                    lastException = e;
                    continue;
                }
                throw e; // Throw other client errors like 401 Unauthorized
            } catch (Exception e) {
                log.error("Error calling Groq API for model '{}': {}", model, e.getMessage(), e);
                lastException = e;
                continue;
            }
        }
        throw new RuntimeException("All fallback Groq models failed. Last error: " + (lastException != null ? lastException.getMessage() : "Unknown"), lastException);
    }

    @Async
    public CompletableFuture<WhoAssessmentDTO> analyzeIngredients(String base64Image, String mimeType, String foodCategory, String userProfileSummary, String language) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(groqApiKey);

            String base64Prefix = "data:" + mimeType + ";base64,";
            
            String currentPrompt = PROMPT;
            if ("fresh".equals(foodCategory)) {
                currentPrompt += " Note: This is a fresh or prepared food item (like a local dish, fruit, etc). State its place of origin in the explanation if applicable.";
            }
            if (userProfileSummary != null && !userProfileSummary.isBlank()) {
                currentPrompt += " <userProfile>" + userProfileSummary + "</userProfile>. Tailor the evaluation, flags, PURPLE status, and recommended serving to this profile.";
            }
            
            // Add language constraint
            if (language != null && !language.equalsIgnoreCase("English")) {
                currentPrompt += "\n\nCRITICAL LANGUAGE CONSTRAINT: The JSON keys must remain in English, but ALL TEXT VALUES (explanations, product names, warnings, etc.) MUST be written in " + language + ".";
            }
            
            final String finalPrompt = currentPrompt;
            String jsonText = executeWithModelFallback(headers, model -> Map.of(
                    "model", model,
                    "messages", List.of(
                            Map.of("role", "system", "content", "You are an expert nutritionist. Output ONLY raw valid JSON. DO NOT include <think> tags. Keep ingredient explanations strictly under 8 words. Be extremely concise so JSON completes."),
                            Map.of(
                                    "role", "user",
                                    "content", List.of(
                                            Map.of("type", "text", "text", finalPrompt),
                                            Map.of("type", "image_url", "image_url", Map.of("url", base64Prefix + base64Image))
                                    )
                            )
                    ),
                    "temperature", 0.1,
                    "max_tokens", 1500
            ), VISION_MODELS);
            jsonText = extractJson(jsonText);
            return CompletableFuture.completedFuture(parseAssessment(jsonText));
        } catch (Exception e) {
            throw new RuntimeException("Fallback Groq AI failed to analyze image: " + e.getMessage(), e);
        }
    }

    @Async
    public CompletableFuture<String> identifyProductFromImage(String base64Image, String mimeType) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "Bearer " + groqApiKey);

            String base64Prefix = "data:" + mimeType + ";base64,";
            
            String identifyPrompt = "Analyze this image. FIRST, determine if the image actually contains any food, beverages, or food packaging. If it is clearly a non-food item (e.g., just a bare hand, a laptop, a face, furniture), return ONLY the exact text: 'NOT_FOOD'. If it shows the FRONT of a food product packaging or fresh food, return ONLY the full brand and product name (e.g. 'Doritos Nacho Cheese'). Do not include any other text, punctuation, or reasoning. If the image clearly shows the BACK of a package (nutrition label or ingredients list), return ONLY the exact text: 'BACK_OF_PACK'.";
            
            String jsonText = executeWithModelFallback(headers, model -> Map.of(
                    "model", model,
                    "messages", List.of(
                            Map.of("role", "system", "content", "You are an AI that extracts product names from packaging. Follow the instructions strictly. If no food is present, output NOT_FOOD."),
                            Map.of(
                                    "role", "user",
                                    "content", List.of(
                                            Map.of("type", "text", "text", identifyPrompt),
                                            Map.of("type", "image_url", "image_url", Map.of("url", base64Prefix + base64Image))
                                    )
                            )
                    ),
                    "temperature", 0.0,
                    "max_tokens", 50
            ), VISION_MODELS);

            if (jsonText == null || jsonText.isBlank()) {
                return CompletableFuture.completedFuture("Unknown Product");
            }
            
            String result = jsonText.replace("\"", "").replace("\n", "").trim();
            if (result.contains("<think>")) {
                int endThink = result.lastIndexOf("</think>");
                if (endThink != -1) {
                    result = result.substring(endThink + 8).trim();
                }
            }
            return CompletableFuture.completedFuture(result);
        } catch (Exception e) {
            log.warn("Groq Vision failed to identify product: {}", e.getMessage());
            return CompletableFuture.completedFuture("Unknown Product");
        }
    }

    @Async
    public CompletableFuture<WhoAssessmentDTO> analyzeIngredientsByName(String productName, String ingredientsText, String servingSize, String quantity, String foodCategory, String userProfileSummary, String language, boolean useFastModel) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(groqApiKey);

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
            String[] targetModels = useFastModel ? new String[]{"llama-3.1-8b-instant", "llama-3.3-70b-versatile"} : TEXT_MODELS;
            String jsonText = executeWithModelFallback(headers, model -> java.util.Map.of(
                    "model", model,
                    "messages", List.of(
                            Map.of("role", "system", "content", "You are an expert nutritionist. Output ONLY raw valid JSON. DO NOT include <think> tags. DO NOT reason internally. /no_think. Keep ingredient explanations strictly under 8 words."),
                            Map.of("role", "user", "content", finalFormattedPrompt)
                    ),
                    "temperature", 0.1,
                    "max_tokens", 4000
            ), targetModels);

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
            throw new RuntimeException("Fallback Groq AI failed to analyze name: " + e.getMessage(), e);
        }
    }

    @Async
    public CompletableFuture<WhoAssessmentDTO> personalizeAssessment(WhoAssessmentDTO genericAssessment, String userProfileSummary, String language) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "Bearer " + groqApiKey);

            String genericJson = objectMapper.writeValueAsString(genericAssessment);
            
            String prompt = "You are an expert nutritionist. I have a generic health assessment for a product:\n\n" + genericJson + 
                "\n\n<userProfile>" + userProfileSummary + "</userProfile>\n\n" +
                "Re-evaluate this product strictly tailored to the user's profile. " +
                "1. Update the 'healthScore' (Integer 0-100) based on how suitable it is for THIS user.\n" +
                "2. Update the 'overallIndicator' (GREEN, YELLOW, RED, PURPLE).\n" +
                "3. Adjust 'status' of ingredients in 'ingredientsFound' if they violate the user's diet (e.g. sugar for diabetics -> PURPLE).\n" +
                "4. Update 'whoFlags' if necessary.\n" +
                "5. Create highly specific 'personalizedAlerts' explaining why certain ingredients are good/bad for this exact user profile.\n" +
                "6. Update 'recommendedServingAdvice' for this user.\n" +
                "7. STRICT GENDER RESTRICTIONS: If user profile specifies MALE, NEVER generate alerts, explanations, or advice mentioning pregnancy, lactation, breastfeeding, maternal health, or PCOS. If user profile specifies FEMALE, NEVER mention prostate health.\n" +
                "8. SWEETENERS & CALORIE DEFICIT CONSISTENCY: Non-Sugar Sweeteners (Aspartame, Sucralose, Acesulfame Potassium, Stevia) are non-caloric substitutes. For users with weight loss, calorie deficit, or sedentary goals, do NOT penalize NSS as a severe RED hazard (they have 0 calories and avoid liquid sugar spikes), and do NOT over-reward them as wholesome GREEN (WHO 2023 guideline advises against routine reliance for long-term weight management). Consistently evaluate NSS drinks as moderate caution (YELLOW, tailored health score 55-65) across all domestic and international variants.\n" +
                "Output ONLY a raw JSON object exactly matching this structure: { \"productName\": \"String\", \"ingredientsFound\": [ { \"name\": \"String\", \"explanation\": \"String\", \"status\": \"GREEN/YELLOW/RED/PURPLE\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"GREEN/YELLOW/RED/PURPLE\", \"explanation\": \"String\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"overallIndicator\": \"GREEN/YELLOW/RED/PURPLE\", \"personalizedAlerts\": [ { \"title\": \"String\", \"explanation\": \"String\", \"severity\": \"GREEN/YELLOW/RED/PURPLE\" } ], \"recommendedServingAdvice\": \"String\", \"healthScore\": 75 }.";

            if (language != null && !language.equalsIgnoreCase("English")) {
                prompt += "\n\nCRITICAL LANGUAGE CONSTRAINT: The JSON keys must remain in English, but ALL TEXT VALUES (explanations, product names, warnings, etc.) MUST be written in " + language + ".";
            }

            final String finalPrompt = prompt;

            String[] targetModels = new String[]{"llama-3.3-70b-versatile", "llama-3.1-8b-instant"};
            String jsonText = executeWithModelFallback(headers, model -> Map.of(
                    "model", model,
                    "messages", List.of(
                            Map.of("role", "system", "content", "You are an expert nutritionist. Output ONLY raw valid JSON. DO NOT include <think> tags. DO NOT reason internally. /no_think. Keep ingredient explanations strictly under 8 words."),
                            Map.of("role", "user", "content", finalPrompt)
                    ),
                    "temperature", 0.1,
                    "max_tokens", 4000
            ), targetModels);

            jsonText = extractJson(jsonText);
            WhoAssessmentDTO parsed = parseAssessment(jsonText);
            
            WhoAssessmentDTO augmented = new WhoAssessmentDTO(
                parsed.isFood() != null ? parsed.isFood() : (genericAssessment.isFood() != null ? genericAssessment.isFood() : true),
                parsed.productName() != null ? parsed.productName() : genericAssessment.productName(),
                parsed.ingredientsFound(),
                parsed.whoFlags(),
                parsed.overallIndicator(),
                genericAssessment.globalEquivalent(),
                genericAssessment.servingSize(),
                genericAssessment.quantity(),
                genericAssessment.dataSourceRegion(),
                parsed.personalizedAlerts(),
                parsed.recommendedServingAdvice(),
                parsed.healthScore()
            );
            return CompletableFuture.completedFuture(augmented);
        } catch (Exception e) {
            log.warn("Failed to personalize cached assessment, falling back to generic: {}", e.getMessage());
            return CompletableFuture.completedFuture(genericAssessment);
        }
    }

    public CompletableFuture<WhoAssessmentDTO> translateAssessment(WhoAssessmentDTO assessment, String targetLanguage) {
        if (assessment == null) {
            return CompletableFuture.completedFuture(null);
        }
        if (targetLanguage == null || targetLanguage.isBlank() || targetLanguage.equalsIgnoreCase("English")) {
            return CompletableFuture.completedFuture(assessment);
        }
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "Bearer " + groqApiKey);

            String assessmentJson = objectMapper.writeValueAsString(assessment);
            String prompt = "You are an expert food science translator. Translate all human-readable natural language text values (productName, recommendedServingAdvice, ingredientsFound.name and explanation, whoFlags.name and explanation, personalizedAlerts.title and explanation) in this food health assessment JSON into " + targetLanguage + ".\n\n" +
                assessmentJson + "\n\n" +
                "RULES:\n" +
                "1. Keep all JSON keys in English.\n" +
                "2. Keep numeric values (healthScore), booleans (isFood), and status codes (PURPLE, RED, YELLOW, GREEN, BLACK, NOT_FOOD) exactly untouched.\n" +
                "3. Preserve culturally recognized ingredient names where standard.\n" +
                "4. Output ONLY valid raw JSON. No markdown backticks, no <think> tags.";

            String[] targetModels = new String[]{"llama-3.3-70b-versatile", "llama-3.1-8b-instant"};
            String jsonText = executeWithModelFallback(headers, model -> Map.of(
                    "model", model,
                    "messages", List.of(
                            Map.of("role", "system", "content", "You are an expert multilingual translator. Output ONLY raw valid JSON. DO NOT include <think> tags. /no_think."),
                            Map.of("role", "user", "content", prompt)
                    ),
                    "temperature", 0.1,
                    "max_tokens", 3500
            ), targetModels);

            jsonText = extractJson(jsonText);
            WhoAssessmentDTO parsed = parseAssessment(jsonText);
            if (parsed != null) {
                WhoAssessmentDTO merged = new WhoAssessmentDTO(
                    assessment.isFood(),
                    parsed.productName() != null ? parsed.productName() : assessment.productName(),
                    parsed.ingredientsFound() != null && !parsed.ingredientsFound().isEmpty() ? parsed.ingredientsFound() : assessment.ingredientsFound(),
                    parsed.whoFlags() != null && !parsed.whoFlags().isEmpty() ? parsed.whoFlags() : assessment.whoFlags(),
                    assessment.overallIndicator(),
                    assessment.globalEquivalent(),
                    assessment.servingSize(),
                    assessment.quantity(),
                    assessment.dataSourceRegion(),
                    parsed.personalizedAlerts() != null && !parsed.personalizedAlerts().isEmpty() ? parsed.personalizedAlerts() : assessment.personalizedAlerts(),
                    parsed.recommendedServingAdvice() != null ? parsed.recommendedServingAdvice() : assessment.recommendedServingAdvice(),
                    assessment.healthScore()
                );
                return CompletableFuture.completedFuture(merged);
            }
            return CompletableFuture.completedFuture(assessment);
        } catch (Exception e) {
            log.warn("Failed to translate assessment to {}: {}", targetLanguage, e.getMessage());
            return CompletableFuture.completedFuture(assessment);
        }
    }

    private String extractRawResponseText(String body) throws Exception {
        JsonNode root = objectMapper.readTree(body);
        JsonNode choices = root.path("choices");
        if (choices.isArray() && choices.size() > 0) {
            return choices.get(0).path("message").path("content").asText("");
        }
        throw new RuntimeException("No choices found in Groq response");
    }

    private String extractJson(String rawText) {
        // Clean out think tags and their content if the model ignored the prompt
        String cleanedText = rawText.replaceAll("(?s)<think>.*?</think>", "").trim();
        
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("\\{.*\\}", java.util.regex.Pattern.DOTALL).matcher(cleanedText);
        if (matcher.find()) {
            return matcher.group();
        }
        // Fallback to original text if regex failed on cleaned text
        matcher = java.util.regex.Pattern.compile("\\{.*\\}", java.util.regex.Pattern.DOTALL).matcher(rawText);
        if (matcher.find()) {
            return matcher.group();
        }
        
        if (cleanedText.isEmpty()) {
            throw new RuntimeException("AI model generated reasoning but failed to output JSON before hitting the token limit.");
        }
        
        return cleanedText;
    }

    private WhoAssessmentDTO parseAssessment(String rawJson) throws Exception {
        try {
            return objectMapper.readValue(rawJson, WhoAssessmentDTO.class);
        } catch (Exception parseEx) {
            log.warn("JSON parse failed, attempting automatic repair on truncated response: {}", parseEx.getMessage());
            String repaired = repairTruncatedJson(rawJson);
            return objectMapper.readValue(repaired, WhoAssessmentDTO.class);
        }
    }

    private String repairTruncatedJson(String text) {
        if (text == null || text.isBlank()) return "{}";
        int firstBrace = text.indexOf('{');
        if (firstBrace == -1) return "{}";
        String s = text.substring(firstBrace).trim();

        // Track unclosed quotes and brackets
        boolean inString = false;
        boolean escaped = false;
        java.util.Stack<Character> stack = new java.util.Stack<>();

        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (escaped) {
                escaped = false;
                continue;
            }
            if (c == '\\') {
                escaped = true;
                continue;
            }
            if (c == '"') {
                inString = !inString;
                continue;
            }
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
        // If cut off mid-string, close quote
        if (inString) {
            sb.append('"');
        }

        // Remove trailing commas or dangling colons before closing
        String current = sb.toString().trim();
        while (current.endsWith(",") || current.endsWith(":")) {
            current = current.substring(0, current.length() - 1).trim();
        }
        sb = new StringBuilder(current);

        // Recalculate remaining unclosed brackets
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
}
