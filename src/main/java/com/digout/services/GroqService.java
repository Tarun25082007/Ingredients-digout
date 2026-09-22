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

@Service
public class GroqService {

    private final String groqApiKey;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    private static final String GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
    
    private static final String PROMPT = "Analyze this image. IF YOU CAN CLEARLY READ THE INGREDIENTS LIST: Extract every ingredient, evaluate against WHO guidelines and USER PROFILE (if any). Statuses: GREEN, YELLOW, RED, PURPLE, BLACK. For each ingredient and WHO flag, include 'dailyLimit' (e.g., 'Max 25g/day (WHO)', 'Max 2000mg sodium/day', '0g / Avoid' - null if not applicable). IF the image contains the backside nutrition table or exact quantities/percentages, calculate 'productAmount' comparing this product's amount vs the daily limit (e.g. '18g per serving (72% of daily limit)', 'Exceeds daily limit (+120%)', or 'Within daily limit'); OTHERWISE set 'productAmount' to null. Calculate a tailored 'healthScore' (Integer from 0 to 100): 80-100 (GREEN: healthy, whole food/low processing, within limits), 55-79 (YELLOW: moderate processing or sodium/sugar), 30-54 (RED: ultra-processed, high hazard/sugar/sodium), 0-29 (PURPLE: severe hazard or contraindicated for user's medical condition/pregnancy/dietary profile - MUST be capped below 30 if PURPLE). Output JSON exactly matching: { \"productName\": \"String\", \"globalEquivalent\": \"String\", \"servingSize\": \"String\", \"quantity\": \"String\", \"ingredientsFound\": [ { \"name\": \"String\", \"explanation\": \"String\", \"status\": \"String\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"String\", \"explanation\": \"String\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"overallIndicator\": \"String\", \"personalizedAlerts\": [ { \"title\": \"String\", \"explanation\": \"String\", \"severity\": \"PURPLE or RED or YELLOW or GREEN\" } ], \"recommendedServingAdvice\": \"String\", \"healthScore\": 75 }.\n\nIF NO INGREDIENTS ARE LEGIBLE (e.g., this is just a photo of the front of the packaging): DO NOT evaluate anything. Instead, identify the product brand and name, and output a JSON with NO ingredients, exactly matching: { \"productName\": \"Identified Brand and Flavor Name\", \"ingredientsFound\": [], \"overallIndicator\": \"BLACK\", \"recommendedServingAdvice\": \"Needs Database Lookup\", \"healthScore\": null }. DO NOT output <think> tags.";
    private static final String TEXT_PROMPT = "The user is asking for the health assessment of a product named '%s'. We have retrieved the following exact ingredients from the database: '%s'. Evaluate these EXACT ingredients against WHO guidelines and the provided USER HEALTH PROFILE (if any). RULES: 1. Statuses can be GREEN (safe), YELLOW (caution), RED (high health risk), PURPLE (HIGHLY NOT RECOMMENDED / strictly contraindicated for user's medical condition, pregnancy, or severe calorie mismatch), BLACK (unknown). 2. For pregnancy, flag high caffeine, unpasteurized items, saccharin, and harmful additives as PURPLE. For ulcers/GERD, flag chili/spices as PURPLE/RED. For diabetes, flag sucrose/high sugar as PURPLE/RED. 3. For each ingredient and WHO flag, provide 'dailyLimit' (WHO/dietary daily limit, e.g. 'Max 25g/day (WHO)', 'Max 2000mg sodium/day', '0g / Avoid'). If exact quantities or percentages are present in the provided ingredients, provide 'productAmount' comparing it to the daily limit (e.g. '15g per serving (60%% of daily limit)' or 'Exceeds daily limit (+110%%)'); otherwise set 'productAmount' to null. 4. Formulate a tailored 'recommendedServingAdvice' based on user calorie goal and health profile. 5. Calculate a tailored 'healthScore' (Integer from 0 to 100): 80-100 (GREEN: wholesome/safe), 55-79 (YELLOW: moderate caution), 30-54 (RED: high health risk/unhealthy), 0-29 (PURPLE: severe hazard or contraindicated for user health profile). CRITICAL: If any ingredient is contraindicated for the user's active health profile, you MUST penalize and cap 'healthScore' below 30 (0 to 29). 6. TRANSLATION RULE: If the ingredients are in a foreign language (e.g., German, French, Spanish), you MUST translate them to English. However, you MUST preserve native cultural ingredient names (e.g., Maida, Ghee, Kimchi, Masa Harina). Do not output raw foreign terms like 'Weizenmehl', translate it to 'Wheat Flour'. 7. DO NOT output reasoning or <think> tags. Output a raw JSON object exactly matching this structure: { \"productName\": \"String\", \"globalEquivalent\": \"String\", \"servingSize\": \"String (leave null if unknown)\", \"quantity\": \"String (leave null if unknown)\", \"ingredientsFound\": [ { \"name\": \"String (ingredient name + EXACT %% or amount if present)\", \"explanation\": \"String (health impact)\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"explanation\": \"String\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"overallIndicator\": \"PURPLE or RED or YELLOW or GREEN\", \"personalizedAlerts\": [ { \"title\": \"String\", \"explanation\": \"String\", \"severity\": \"PURPLE or RED or YELLOW or GREEN\" } ], \"recommendedServingAdvice\": \"String\", \"healthScore\": 75 }.";

    private static final String[] TEXT_MODELS = {
            "openai/gpt-oss-120b",
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
                    System.err.println("Groq model '" + model + "' failed or rate limited (" + e.getStatusCode() + "). Response: " + responseBody + ". Automatically upgrading to next model...");
                    lastException = e;
                    continue;
                }
                throw e; // Throw other client errors like 401 Unauthorized
            } catch (Exception e) {
                System.err.println("Error calling Groq API for model '" + model + "': " + e.getMessage());
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
                currentPrompt += " [ACTIVE USER HEALTH PROFILE: " + userProfileSummary + "]. Tailor the evaluation, flags, PURPLE status, and recommended serving to this profile.";
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
            
            String identifyPrompt = "Analyze this image. If it shows the FRONT of a food product packaging, return ONLY the full brand and product name (e.g. 'Doritos Nacho Cheese'). Do not include any other text, punctuation, or reasoning. If the image clearly shows the BACK of a package (nutrition label or ingredients list), return ONLY the exact text: 'BACK_OF_PACK'.";
            
            String jsonText = executeWithModelFallback(headers, model -> Map.of(
                    "model", model,
                    "messages", List.of(
                            Map.of("role", "system", "content", "You are an AI that extracts product names from packaging. Follow the instructions strictly."),
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
            System.err.println("Groq Vision failed to identify product: " + e.getMessage());
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
                formattedPrompt = "The user is asking for the health assessment of a product named '" + productName + "'. We DO NOT have database ingredients for this, so you MUST use your internal knowledge base to identify this product and assume its standard ingredients. ";
                if ("fresh".equals(foodCategory)) {
                    formattedPrompt += "This is a fresh or prepared food (like a local dish, fruit, or homemade meal). If it is a local/regional dish, please state its place of origin in the explanation. ";
                } else {
                    formattedPrompt += "If this is a regional packaged product, identify the most popular global equivalent and use THAT product's ingredients instead, setting 'globalEquivalent'. ";
                }
                formattedPrompt += "Evaluate the ingredients against WHO guidelines and the provided USER HEALTH PROFILE. RULES: 1. Statuses: GREEN (safe), YELLOW (moderate), RED (avoid), PURPLE (HIGHLY NOT RECOMMENDED / strictly contraindicated for user conditions/pregnancy/calorie goal), BLACK (unknown). 2. For pregnancy, flag caffeine >200mg, raw/unpasteurized items, saccharin as PURPLE. For ulcers, flag chili/spices as PURPLE or RED. For diabetes, flag sugar as PURPLE or RED. 3. For each ingredient and WHO flag, include 'dailyLimit' (e.g. 'Max 25g/day (WHO)'). Since exact quantities are not available in this mode, set 'productAmount' to null. 4. Suggest a safe 'recommendedServingAdvice' (or '0 - Strictly Avoid' if PURPLE). 5. Calculate a tailored 'healthScore' (Integer from 0 to 100): 80-100 (GREEN), 55-79 (YELLOW), 30-54 (RED), 0-29 (PURPLE/contraindicated). If contraindicated for user profile, cap 'healthScore' below 30. 6. DO NOT output reasoning or <think> tags. Output a raw JSON object exactly matching: { \"productName\": \"String\", \"globalEquivalent\": \"String\", \"servingSize\": \"String (leave null if unknown)\", \"quantity\": \"String (leave null if unknown)\", \"ingredientsFound\": [ { \"name\": \"String (ingredient name ONLY, no estimated amounts)\", \"explanation\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"dailyLimit\": \"String or null\", \"productAmount\": null } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"explanation\": \"String\", \"dailyLimit\": \"String or null\", \"productAmount\": null } ], \"overallIndicator\": \"PURPLE or RED or YELLOW or GREEN\", \"personalizedAlerts\": [ { \"title\": \"String\", \"explanation\": \"String\", \"severity\": \"PURPLE or RED or YELLOW or GREEN\" } ], \"recommendedServingAdvice\": \"String\", \"healthScore\": 75 }.";
            } else {
                formattedPrompt = String.format(TEXT_PROMPT, productName, ingredientsText);
                if ("fresh".equals(foodCategory)) {
                    formattedPrompt += " Note: This is a fresh or prepared food. If it's a local dish, mention its place of origin in the explanation.";
                }
            }

            if (userProfileSummary != null && !userProfileSummary.isBlank()) {
                formattedPrompt += " [ACTIVE USER HEALTH PROFILE: " + userProfileSummary + "]. Tailor the evaluation, flags, PURPLE status, and recommended serving to this profile.";
            }
            
            // Add language constraint
            if (language != null && !language.equalsIgnoreCase("English")) {
                formattedPrompt += "\n\nCRITICAL LANGUAGE CONSTRAINT: The JSON keys must remain in English, but ALL TEXT VALUES (explanations, product names, warnings, etc.) MUST be written in " + language + ".";
            }
            
            final String finalFormattedPrompt = formattedPrompt;
            String[] targetModels = useFastModel ? new String[]{"qwen/qwen3.8-27b", TEXT_MODELS[0]} : TEXT_MODELS;
            String jsonText = executeWithModelFallback(headers, model -> java.util.Map.of(
                    "model", model,
                    "messages", List.of(
                            Map.of("role", "system", "content", "You are an expert nutritionist. Output ONLY raw valid JSON. DO NOT include <think> tags. Keep ingredient explanations strictly under 8 words."),
                            Map.of("role", "user", "content", finalFormattedPrompt)
                    ),
                    "temperature", 0.1,
                    "max_tokens", 4000
            ), targetModels);

            jsonText = extractJson(jsonText);
            WhoAssessmentDTO parsed = parseAssessment(jsonText);
            WhoAssessmentDTO augmented = new WhoAssessmentDTO(
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

    public CompletableFuture<WhoAssessmentDTO> personalizeAssessment(WhoAssessmentDTO genericAssessment, String userProfileSummary, String language) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "Bearer " + groqApiKey);

            String genericJson = objectMapper.writeValueAsString(genericAssessment);
            
            String prompt = "You are an expert nutritionist. I have a generic health assessment for a product:\n\n" + genericJson + 
                "\n\n[ACTIVE USER HEALTH PROFILE: " + userProfileSummary + "]\n\n" +
                "Re-evaluate this product strictly tailored to the user's profile. " +
                "1. Update the 'healthScore' (Integer 0-100) based on how suitable it is for THIS user.\n" +
                "2. Update the 'overallIndicator' (GREEN, YELLOW, RED, PURPLE).\n" +
                "3. Adjust 'status' of ingredients in 'ingredientsFound' if they violate the user's diet (e.g. sugar for diabetics -> PURPLE).\n" +
                "4. Update 'whoFlags' if necessary.\n" +
                "5. Create highly specific 'personalizedAlerts' explaining why certain ingredients are good/bad for this exact user profile.\n" +
                "6. Update 'recommendedServingAdvice' for this user.\n" +
                "Output ONLY a raw JSON object exactly matching this structure: { \"productName\": \"String\", \"ingredientsFound\": [ { \"name\": \"String\", \"explanation\": \"String\", \"status\": \"GREEN/YELLOW/RED/PURPLE\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"GREEN/YELLOW/RED/PURPLE\", \"explanation\": \"String\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"overallIndicator\": \"GREEN/YELLOW/RED/PURPLE\", \"personalizedAlerts\": [ { \"title\": \"String\", \"explanation\": \"String\", \"severity\": \"GREEN/YELLOW/RED/PURPLE\" } ], \"recommendedServingAdvice\": \"String\", \"healthScore\": 75 }.";

            if (language != null && !language.equalsIgnoreCase("English")) {
                prompt += "\n\nCRITICAL LANGUAGE CONSTRAINT: The JSON keys must remain in English, but ALL TEXT VALUES (explanations, product names, warnings, etc.) MUST be written in " + language + ".";
            }

            final String finalPrompt = prompt;

            String[] targetModels = new String[]{"qwen/qwen3.8-27b", TEXT_MODELS[0]};
            String jsonText = executeWithModelFallback(headers, model -> Map.of(
                    "model", model,
                    "messages", List.of(
                            Map.of("role", "system", "content", "You are an expert nutritionist. Output ONLY raw valid JSON. DO NOT include <think> tags. Keep ingredient explanations strictly under 8 words."),
                            Map.of("role", "user", "content", finalPrompt)
                    ),
                    "temperature", 0.1,
                    "max_tokens", 4000
            ), targetModels);

            jsonText = extractJson(jsonText);
            WhoAssessmentDTO parsed = parseAssessment(jsonText);
            
            WhoAssessmentDTO augmented = new WhoAssessmentDTO(
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
            System.err.println("Failed to personalize cached assessment, falling back to generic: " + e.getMessage());
            return CompletableFuture.completedFuture(genericAssessment);
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
        
        return cleanedText.isEmpty() ? rawText : cleanedText;
    }

    private WhoAssessmentDTO parseAssessment(String rawJson) throws Exception {
        try {
            return objectMapper.readValue(rawJson, WhoAssessmentDTO.class);
        } catch (Exception parseEx) {
            System.err.println("JSON parse failed, attempting automatic repair on truncated response: " + parseEx.getMessage());
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
