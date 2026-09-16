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
public class GeminiService {

    private final String geminiApiKey;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final GroqService groqService;

    private static final String GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions?key=";
    private static final String PROMPT = "Analyze this image. IF YOU CAN CLEARLY READ THE INGREDIENTS LIST: Extract every ingredient, evaluate against WHO guidelines and USER PROFILE (if any). Statuses: GREEN, YELLOW, RED, PURPLE, BLACK. For each ingredient and WHO flag, include 'dailyLimit' (e.g., 'Max 25g/day (WHO)', 'Max 2000mg sodium/day', '0g / Avoid' - null if not applicable). IF the image contains the backside nutrition table or exact quantities/percentages, calculate 'productAmount' comparing this product's amount vs the daily limit (e.g. '18g per serving (72% of daily limit)', 'Exceeds daily limit (+120%)', or 'Within daily limit'); OTHERWISE set 'productAmount' to null. Output JSON exactly matching: { \"productName\": \"String\", \"globalEquivalent\": \"String\", \"servingSize\": \"String\", \"quantity\": \"String\", \"ingredientsFound\": [ { \"name\": \"String\", \"explanation\": \"String\", \"status\": \"String\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"String\", \"explanation\": \"String\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"overallIndicator\": \"String\", \"personalizedAlerts\": [ { \"title\": \"String\", \"explanation\": \"String\", \"severity\": \"PURPLE or RED or YELLOW or GREEN\" } ], \"recommendedServingAdvice\": \"String\" }.\n\nIF NO INGREDIENTS ARE LEGIBLE (e.g., this is just a photo of the front of the packaging): DO NOT evaluate anything. Instead, identify the product brand and name, and output a JSON with NO ingredients, exactly matching: { \"productName\": \"Identified Brand and Flavor Name\", \"ingredientsFound\": [], \"overallIndicator\": \"BLACK\", \"recommendedServingAdvice\": \"Needs Database Lookup\" }. DO NOT output <think> tags.";
    private static final String TEXT_PROMPT = "The user is asking for the health assessment of a product named '%s'. We have retrieved the following exact ingredients from the database: '%s'. Evaluate these EXACT ingredients against WHO guidelines and the provided USER HEALTH PROFILE (if any). RULES: 1. Statuses can be GREEN (safe), YELLOW (caution), RED (high health risk), PURPLE (HIGHLY NOT RECOMMENDED / strictly contraindicated for user's medical condition, pregnancy, or severe calorie mismatch), BLACK (unknown). 2. For pregnancy, flag high caffeine, unpasteurized items, saccharin, and harmful additives as PURPLE. For ulcers/GERD, flag chili/spices as PURPLE/RED. For diabetes, flag sucrose/high sugar as PURPLE/RED. 3. For each ingredient and WHO flag, provide 'dailyLimit' (WHO/dietary daily limit, e.g. 'Max 25g/day (WHO)', 'Max 2000mg sodium/day', '0g / Avoid'). If exact quantities or percentages are present in the provided ingredients, provide 'productAmount' comparing it to the daily limit (e.g. '15g per serving (60% of daily limit)' or 'Exceeds daily limit (+110%)'); otherwise set 'productAmount' to null. 4. Formulate a tailored 'recommendedServingAdvice' based on user calorie goal and health profile. 5. DO NOT output reasoning or <think> tags. Output a raw JSON object exactly matching this structure: { \"productName\": \"String\", \"globalEquivalent\": \"String\", \"servingSize\": \"String (leave null if unknown)\", \"quantity\": \"String (leave null if unknown)\", \"ingredientsFound\": [ { \"name\": \"String (ingredient name + EXACT %% or amount if present)\", \"explanation\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"explanation\": \"String\", \"dailyLimit\": \"String or null\", \"productAmount\": \"String or null\" } ], \"overallIndicator\": \"PURPLE or RED or YELLOW or GREEN\", \"personalizedAlerts\": [ { \"title\": \"String\", \"explanation\": \"String\", \"severity\": \"PURPLE or RED or YELLOW or GREEN\" } ], \"recommendedServingAdvice\": \"String\" }.";

    private static final String[] GEMINI_MODELS = {
            "gemini-3.6-flash",    // Recommended active flagship model (tested 200 OK)
            "gemini-3.5-flash",    // Fast secondary fallback (tested 200 OK)
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
            } catch (org.springframework.web.client.HttpClientErrorException e) {
                String responseBody = e.getResponseBodyAsString();
                if (e.getStatusCode().value() == 400 || responseBody.contains("not found") || responseBody.contains("invalid model") || responseBody.contains("decommissioned")) {
                    System.err.println("Gemini model '" + model + "' is unavailable or failed (" + e.getStatusCode() + "). Upgrading to next model...");
                    lastException = e;
                    continue;
                }
                throw e; // Other 4xx errors
            } catch (Exception e) {
                throw new RuntimeException("Gemini API error: " + e.getMessage(), e);
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
                JsonNode root = objectMapper.readTree(response.getBody());
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
                        System.out.println("Gemini Overload or Timeout! Retrying in 2s... (Attempt " + (i+1) + "/" + maxRetries + ")");
                        Thread.sleep(2000); // wait 2 seconds before retrying
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                    continue;
                } else if (e.getMessage() != null && e.getMessage().contains("429")) {
                     System.out.println("Gemini Rate Limit reached! Falling back to GroqService...");
                     return groqService.analyzeIngredients(base64Image, mimeType, foodCategory, userProfileSummary, language);
                }
                
                System.out.println("Gemini failed, falling back to GroqService: " + e.getMessage());
                return groqService.analyzeIngredients(base64Image, mimeType, foodCategory, userProfileSummary, language);
            }
        }
        System.out.println("Gemini exhausted retries, falling back to GroqService...");
        return groqService.analyzeIngredients(base64Image, mimeType, foodCategory, userProfileSummary, language);
    }

    @Async
    public CompletableFuture<WhoAssessmentDTO> analyzeIngredientsByName(String productName, String ingredientsText, String servingSize, String quantity, String foodCategory, String userProfileSummary, String language) {
        int maxRetries = 3;
        for (int i = 0; i < maxRetries; i++) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);

                String formattedPrompt;
                if (ingredientsText == null || ingredientsText.isBlank()) {
                    formattedPrompt = "The user is asking for the health assessment of a product named '" + productName + "'. We DO NOT have database ingredients for this, so you MUST use your internal knowledge base to identify this product and assume its standard ingredients. ";
                    if ("fresh".equals(foodCategory)) {
                        formattedPrompt += "This is a fresh or prepared food (like a local dish, fruit, or homemade meal). If it is a local/regional dish, please state its place of origin in the explanation. ";
                    } else {
                        formattedPrompt += "If this is a regional packaged product, identify the most popular global equivalent and use THAT product's ingredients instead, setting 'globalEquivalent'. ";
                    }
                    formattedPrompt += "Evaluate the ingredients against WHO guidelines and the provided USER HEALTH PROFILE. RULES: 1. Statuses: GREEN (safe), YELLOW (moderate), RED (avoid), PURPLE (HIGHLY NOT RECOMMENDED / strictly contraindicated for user conditions/pregnancy/calorie goal), BLACK (unknown). 2. For pregnancy, flag caffeine >200mg, raw/unpasteurized items, saccharin as PURPLE. For ulcers, flag chili/spices as PURPLE or RED. For diabetes, flag sugar as PURPLE or RED. 3. For each ingredient and WHO flag, include 'dailyLimit' (e.g. 'Max 25g/day (WHO)'). Since exact quantities are not available in this mode, set 'productAmount' to null. 4. Suggest a safe 'recommendedServingAdvice' (or '0 - Strictly Avoid' if PURPLE). 5. DO NOT output reasoning or <think> tags. Output a raw JSON object exactly matching: { \"productName\": \"String\", \"globalEquivalent\": \"String\", \"servingSize\": \"String (leave null if unknown)\", \"quantity\": \"String (leave null if unknown)\", \"ingredientsFound\": [ { \"name\": \"String (ingredient name ONLY, no estimated amounts)\", \"explanation\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"dailyLimit\": \"String or null\", \"productAmount\": null } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"explanation\": \"String\", \"dailyLimit\": \"String or null\", \"productAmount\": null } ], \"overallIndicator\": \"PURPLE or RED or YELLOW or GREEN\", \"personalizedAlerts\": [ { \"title\": \"String\", \"explanation\": \"String\", \"severity\": \"PURPLE or RED or YELLOW or GREEN\" } ], \"recommendedServingAdvice\": \"String\" }.";
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
                JsonNode root = objectMapper.readTree(response.getBody());
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
                    parsed.productName(),
                    parsed.ingredientsFound(),
                    parsed.whoFlags(),
                    parsed.overallIndicator(),
                    parsed.globalEquivalent(),
                    servingSize != null ? servingSize : parsed.servingSize(),
                    quantity != null ? quantity : parsed.quantity(),
                    null,
                    parsed.personalizedAlerts(),
                    parsed.recommendedServingAdvice()
                );
                return CompletableFuture.completedFuture(augmented);
            } catch (Exception e) {
                if (e.getMessage() != null && (e.getMessage().contains("503") || e.getMessage().toLowerCase().contains("timed out") || e.getMessage().toLowerCase().contains("timeout")) && i < maxRetries - 1) {
                    try {
                        System.out.println("Gemini Overload or Timeout! Retrying in 2s... (Attempt " + (i+1) + "/" + maxRetries + ")");
                        Thread.sleep(2000);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                    continue;
                } else if (e.getMessage() != null && e.getMessage().contains("429")) {
                     System.out.println("Gemini Rate Limit reached! Falling back to GroqService for name analysis...");
                     return groqService.analyzeIngredientsByName(productName, ingredientsText, servingSize, quantity, foodCategory, userProfileSummary, language);
                }
                System.out.println("Gemini failed for name analysis, falling back to GroqService: " + e.getMessage());
                return groqService.analyzeIngredientsByName(productName, ingredientsText, servingSize, quantity, foodCategory, userProfileSummary, language);
            }
        }
        System.out.println("Gemini exhausted retries for name analysis, falling back to GroqService...");
        return groqService.analyzeIngredientsByName(productName, ingredientsText, servingSize, quantity, foodCategory, userProfileSummary, language);
    }

    private WhoAssessmentDTO parseAssessment(String rawJson) throws Exception {
        try {
            return objectMapper.readValue(rawJson, WhoAssessmentDTO.class);
        } catch (Exception parseEx) {
            System.err.println("Gemini JSON parse failed, attempting automatic repair on truncated response: " + parseEx.getMessage());
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
        java.util.Stack<Character> stack = new java.util.Stack<>();

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

    private String extractJson(String rawText) {
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("\\{.*\\}", java.util.regex.Pattern.DOTALL).matcher(rawText);
        if (matcher.find()) {
            return matcher.group();
        }
        return rawText;
    }

    public com.digout.dto.OpenFoodFactsDTO getIngredientsDatabaseFallback(String productName) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            String dbPrompt = "You are a product ingredient database. The user is searching for '" + productName.replace("'", "") + "'. Output a JSON object containing 'product_name' and 'ingredients_text' (a comma separated string of typical ingredients for the global/popular version of this product) based on your knowledge. Output RAW JSON ONLY.";
            
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
                         jsonText = step.path("content").get(0).path("text").asText();
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
                null
            );
        } catch (Exception e) {
            throw new RuntimeException("Fallback database AI failed: " + e.getMessage(), e);
        }
    }
}
