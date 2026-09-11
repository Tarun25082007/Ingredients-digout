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
    
    private static final String PROMPT = "Analyze this image. IF YOU CAN CLEARLY READ THE INGREDIENTS LIST: Extract every ingredient, evaluate against WHO guidelines and USER PROFILE (if any). Statuses: GREEN, YELLOW, RED, PURPLE, BLACK. Output JSON exactly matching: { \"productName\": \"String\", \"globalEquivalent\": \"String\", \"servingSize\": \"String\", \"quantity\": \"String\", \"ingredientsFound\": [ { \"name\": \"String\", \"explanation\": \"String\", \"status\": \"String\" } ], \"whoFlags\": [...], \"overallIndicator\": \"String\", \"personalizedAlerts\": [...], \"recommendedServingAdvice\": \"String\" }.\n\nIF NO INGREDIENTS ARE LEGIBLE (e.g., this is just a photo of the front of the packaging): DO NOT evaluate anything. Instead, identify the product brand and name, and output a JSON with NO ingredients, exactly matching: { \"productName\": \"Identified Brand and Flavor Name\", \"ingredientsFound\": [], \"overallIndicator\": \"BLACK\", \"recommendedServingAdvice\": \"Needs Database Lookup\" }. DO NOT output <think> tags.";
    private static final String TEXT_PROMPT = "The user is asking for the health assessment of a product named '%s'. We have retrieved the following exact ingredients from the database: '%s'. Evaluate these EXACT ingredients against WHO guidelines and the provided USER HEALTH PROFILE (if any). RULES: 1. Statuses can be GREEN (safe), YELLOW (caution), RED (high health risk), PURPLE (HIGHLY NOT RECOMMENDED / strictly contraindicated for user's medical condition, pregnancy, or severe calorie mismatch), BLACK (unknown). 2. For pregnancy, flag high caffeine, unpasteurized items, saccharin, and harmful additives as PURPLE. For ulcers/GERD, flag chili/spices as PURPLE/RED. For diabetes, flag sucrose/high sugar as PURPLE/RED. 3. Formulate a tailored 'recommendedServingAdvice' based on user calorie goal and health profile. 4. DO NOT output reasoning or <think> tags. Output a raw JSON object exactly matching this structure: { \"productName\": \"String\", \"globalEquivalent\": \"String\", \"servingSize\": \"String (leave null if unknown)\", \"quantity\": \"String (leave null if unknown)\", \"ingredientsFound\": [ { \"name\": \"String (ingredient name + EXACT %% or amount if present)\", \"explanation\": \"String (health impact)\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"explanation\": \"String\" } ], \"overallIndicator\": \"PURPLE or RED or YELLOW or GREEN\", \"personalizedAlerts\": [ { \"title\": \"String\", \"explanation\": \"String\", \"severity\": \"PURPLE or RED or YELLOW or GREEN\" } ], \"recommendedServingAdvice\": \"String\" }.";

    private static final String[] TEXT_MODELS = {
            "openai/gpt-oss-20b",  // Most token efficient
            "groq/compound",       // High speed
            "qwen/qwen3.8-27b",    // Balanced
            "openai/gpt-oss-120b"  // Largest, deepest fallback
    };

    private static final String[] VISION_MODELS = {
            "qwen/qwen3.6-27b",    // Vision capable
            "qwen/qwen3.8-27b"     // Vision fallback
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
                // Groq free tier limit is often 1000 OTPM. 950 is safe.
                if (!payload.containsKey("max_tokens")) {
                    java.util.Map<String, Object> newPayload = new java.util.HashMap<>(payload);
                    newPayload.put("max_tokens", 950);
                    payload = newPayload;
                }
                HttpEntity<java.util.Map<String, Object>> request = new HttpEntity<>(payload, headers);
                ResponseEntity<String> response = restTemplate.postForEntity(GROQ_API_URL, request, String.class);
                return extractResponseText(response.getBody());
            } catch (org.springframework.web.client.HttpClientErrorException e) {
                String responseBody = e.getResponseBodyAsString();
                if (e.getStatusCode().value() == 400 || responseBody.contains("model_decommissioned") || responseBody.contains("not found") || responseBody.contains("invalid model") || responseBody.contains("rate_limit_exceeded") || e.getStatusCode().value() == 429) {
                    System.err.println("Groq model '" + model + "' failed or rate limited (" + e.getStatusCode() + "). Automatically upgrading to next model...");
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
                            Map.of("role", "system", "content", "You are an expert nutritionist. Output ONLY valid JSON. Start your response with '{' and end with '}'. VERY IMPORTANT: Keep your internal <think> reasoning EXTREMELY BRIEF (under 200 words)."),
                            Map.of(
                                    "role", "user",
                                    "content", List.of(
                                            Map.of("type", "text", "text", finalPrompt),
                                            Map.of("type", "image_url", "image_url", Map.of("url", base64Prefix + base64Image))
                                    )
                            )
                    ),
                    "temperature", 0.1,
                    "max_tokens", 650
            ), VISION_MODELS);

            return CompletableFuture.completedFuture(objectMapper.readValue(jsonText, WhoAssessmentDTO.class));
        } catch (Exception e) {
            throw new RuntimeException("Fallback Groq AI failed to analyze image: " + e.getMessage(), e);
        }
    }

    @Async
    public CompletableFuture<WhoAssessmentDTO> analyzeIngredientsByName(String productName, String ingredientsText, String servingSize, String quantity, String foodCategory, String userProfileSummary, String language) {
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
                formattedPrompt += "Evaluate the ingredients against WHO guidelines and the provided USER HEALTH PROFILE. RULES: 1. Statuses: GREEN (safe), YELLOW (moderate), RED (avoid), PURPLE (HIGHLY NOT RECOMMENDED / strictly contraindicated for user conditions/pregnancy/calorie goal), BLACK (unknown). 2. For pregnancy, flag caffeine >200mg, raw/unpasteurized items, saccharin as PURPLE. For ulcers, flag chili/spices as PURPLE or RED. For diabetes, flag sugar as PURPLE or RED. 3. Suggest a safe 'recommendedServingAdvice' (or '0 - Strictly Avoid' if PURPLE). 4. DO NOT output reasoning or <think> tags. Output a raw JSON object exactly matching: { \"productName\": \"String\", \"globalEquivalent\": \"String\", \"servingSize\": \"String (leave null if unknown)\", \"quantity\": \"String (leave null if unknown)\", \"ingredientsFound\": [ { \"name\": \"String (ingredient name ONLY, no estimated amounts)\", \"explanation\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"explanation\": \"String\" } ], \"overallIndicator\": \"PURPLE or RED or YELLOW or GREEN\", \"personalizedAlerts\": [ { \"title\": \"String\", \"explanation\": \"String\", \"severity\": \"PURPLE or RED or YELLOW or GREEN\" } ], \"recommendedServingAdvice\": \"String\" }.";
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
            String jsonText = executeWithModelFallback(headers, model -> java.util.Map.of(
                    "model", model,
                    "messages", List.of(
                            Map.of("role", "system", "content", "You are an expert nutritionist. Output ONLY valid JSON."),
                            Map.of("role", "user", "content", finalFormattedPrompt)
                    ),
                    "temperature", 0.1,
                    "response_format", Map.of("type", "json_object")
            ), TEXT_MODELS);

            WhoAssessmentDTO parsed = objectMapper.readValue(jsonText, WhoAssessmentDTO.class);
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
            throw new RuntimeException("Fallback Groq AI failed to analyze name: " + e.getMessage(), e);
        }
    }

    private String extractResponseText(String body) throws Exception {
        JsonNode root = objectMapper.readTree(body);
        JsonNode choices = root.path("choices");
        if (choices.isArray() && choices.size() > 0) {
            String rawText = choices.get(0).path("message").path("content").asText("");
            return extractJson(rawText);
        }
        throw new RuntimeException("No choices found in Groq response");
    }

    private String extractJson(String rawText) {
        // Clean out think tags and their content if the model ignored the prompt
        String cleanedText = rawText.replaceAll("(?s)\\s*<think>.*?(?:</think>|$)", "").trim();
        
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
}
