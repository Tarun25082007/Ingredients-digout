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
    
    private static final String PROMPT = "Extract every ingredient from this image. Extract the total quantity and serving size if visible. IF the image does not clearly show the ingredients, you MUST use your internal knowledge base to identify this product and assume its standard globally popular ingredients. IF THIS IS A REGIONAL PRODUCT (e.g. Campa Orange), you MUST identify the most popular global equivalent (e.g. Fanta Orange) and use THAT product's ingredients instead, and set 'globalEquivalent' to that name. Evaluate the ingredients against WHO guidelines. RULES: 1. Be strictly consistent: Sugar/Sucrose MUST be RED. Preservatives MUST be YELLOW or RED. Natural flavors/water MUST be GREEN. 2. If an ingredient is unknown, its status MUST be BLACK. 3. DO NOT output any reasoning, explanations, or <think> tags. You MUST output a raw JSON object exactly matching this structure, with no extra text: { \"productName\": \"String\", \"globalEquivalent\": \"String (highly popular global equivalent brand/product if this is regional, e.g. 'Fanta Orange' for 'Campa Orange', else same as productName)\", \"servingSize\": \"String (e.g. 200ml, leave null if unknown)\", \"quantity\": \"String (e.g. 1L, leave null if unknown)\", \"ingredientsFound\": [ { \"name\": \"String (ingredient name + exact % or amount from the image if present)\", \"explanation\": \"String (health impact)\", \"status\": \"RED or YELLOW or GREEN or BLACK\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"RED or YELLOW or GREEN or BLACK\", \"explanation\": \"String\" } ], \"overallIndicator\": \"RED or YELLOW or GREEN\" }.";
    private static final String TEXT_PROMPT = "The user is asking for the health assessment of a product named '%s'. We have retrieved the following exact ingredients from the database: '%s'. Evaluate these EXACT ingredients against WHO guidelines. RULES: 1. Be strictly consistent: Sugar/Sucrose MUST be RED. Preservatives MUST be YELLOW or RED. Natural flavors/water MUST be GREEN. 2. If an ingredient is unknown, its status MUST be BLACK. 3. DO NOT output any reasoning, explanations, or <think> tags. You MUST output a raw JSON object exactly matching this structure, with no extra text: { \"productName\": \"String (the actual corrected/identified product name)\", \"globalEquivalent\": \"String (the globally popular equivalent if regional)\", \"servingSize\": \"String (leave null if unknown)\", \"quantity\": \"String (leave null if unknown)\", \"ingredientsFound\": [ { \"name\": \"String (ingredient name + EXACT %% or amount from the provided database text if present)\", \"explanation\": \"String (health impact)\", \"status\": \"RED or YELLOW or GREEN or BLACK\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"RED or YELLOW or GREEN or BLACK\", \"explanation\": \"String\" } ], \"overallIndicator\": \"RED or YELLOW or GREEN\" }.";

    private static final String[] TEXT_MODELS = {
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "groq/compound",
            "qwen/qwen3.8-27b"
    };

    private static final String[] VISION_MODELS = {
            "qwen/qwen3.6-27b",
            "openai/gpt-oss-120b"
    };

    public GroqService(@Value("${groq.api.key}") String groqApiKey, RestTemplate restTemplate, ObjectMapper objectMapper) {
        this.groqApiKey = groqApiKey;
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
    }

    private ResponseEntity<String> executeWithModelFallback(HttpHeaders headers, java.util.function.Function<String, java.util.Map<String, Object>> payloadBuilder, String[] models) {
        Exception lastException = null;
        for (String model : models) {
            try {
                java.util.Map<String, Object> payload = payloadBuilder.apply(model);
                // Max tokens adjusted to prevent 413 Payload Too Large on 8000 TPM limit
                if (!payload.containsKey("max_tokens")) {
                    java.util.Map<String, Object> newPayload = new java.util.HashMap<>(payload);
                    newPayload.put("max_tokens", 4500);
                    payload = newPayload;
                }
                HttpEntity<java.util.Map<String, Object>> request = new HttpEntity<>(payload, headers);
                return restTemplate.postForEntity(GROQ_API_URL, request, String.class);
            } catch (org.springframework.web.client.HttpClientErrorException e) {
                String responseBody = e.getResponseBodyAsString();
                if (responseBody.contains("model_decommissioned") || responseBody.contains("does not exist") || responseBody.contains("not found")) {
                    System.err.println("Groq model '" + model + "' is decommissioned or unavailable. Automatically upgrading to next model...");
                    lastException = e;
                    continue;
                }
                throw e; // Throw other client errors like 401 Unauthorized
            } catch (Exception e) {
                throw new RuntimeException("Error calling Groq API: " + e.getMessage(), e);
            }
        }
        throw new RuntimeException("All fallback Groq models failed. Last error: " + (lastException != null ? lastException.getMessage() : "Unknown"), lastException);
    }

    @Async
    public CompletableFuture<WhoAssessmentDTO> analyzeIngredients(String base64Image, String mimeType) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(groqApiKey);

            String base64Prefix = "data:" + mimeType + ";base64,";
            
            ResponseEntity<String> response = executeWithModelFallback(headers, model -> Map.of(
                    "model", model,
                    "messages", List.of(
                            Map.of("role", "system", "content", "You are an expert nutritionist. Output ONLY valid JSON. Start your response with '{' and end with '}'. VERY IMPORTANT: Keep your internal <think> reasoning EXTREMELY BRIEF (under 200 words)."),
                            Map.of(
                                    "role", "user",
                                    "content", List.of(
                                            Map.of("type", "text", "text", PROMPT),
                                            Map.of("type", "image_url", "image_url", Map.of("url", base64Prefix + base64Image))
                                    )
                            )
                    ),
                    "temperature", 0.1
            ), VISION_MODELS);

            String jsonText = extractResponseText(response.getBody());
            return CompletableFuture.completedFuture(objectMapper.readValue(jsonText, WhoAssessmentDTO.class));
        } catch (Exception e) {
            throw new RuntimeException("Fallback Groq AI failed to analyze image: " + e.getMessage(), e);
        }
    }

    @Async
    public CompletableFuture<WhoAssessmentDTO> analyzeIngredientsByName(String productName, String ingredientsText, String servingSize, String quantity) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(groqApiKey);

            String formattedPrompt;
            if (ingredientsText != null && !ingredientsText.trim().isEmpty() && !ingredientsText.equals("No ingredients available")) {
                formattedPrompt = String.format(TEXT_PROMPT, productName.replace("'", ""), ingredientsText.replace("'", ""));
            } else {
                formattedPrompt = "The user is asking for the health assessment of a product named '" + productName.replace("'", "") + "'. We DO NOT have the ingredient list. Use your internal knowledge base to identify this product and its standard globally popular ingredients. IF THIS IS A REGIONAL PRODUCT (e.g. Campa Orange), you MUST identify the most popular global equivalent (e.g. Fanta Orange) and use THAT product's ingredients instead, and set 'productName' to the global equivalent's name. Evaluate these assumed ingredients against WHO guidelines. RULES: 1. Be strictly consistent: Sugar/Sucrose MUST be RED. Preservatives MUST be YELLOW or RED. Natural flavors/water MUST be GREEN. 2. If an ingredient is unknown, its status MUST be BLACK. 3. DO NOT output any reasoning, explanations, or <think> tags. You MUST output a raw JSON object exactly matching this structure, with no extra text: { \"productName\": \"String (the actual corrected/identified product name)\", \"globalEquivalent\": \"String (the globally popular equivalent if regional)\", \"servingSize\": \"String (leave null if unknown)\", \"quantity\": \"String (leave null if unknown)\", \"ingredientsFound\": [ { \"name\": \"String (ingredient name ONLY, no estimated amounts)\", \"explanation\": \"String (health impact)\", \"status\": \"RED or YELLOW or GREEN or BLACK\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"RED or YELLOW or GREEN or BLACK\", \"explanation\": \"String\" } ], \"overallIndicator\": \"RED or YELLOW or GREEN\" }.";
            }
            
            ResponseEntity<String> response = executeWithModelFallback(headers, model -> java.util.Map.of(
                    "model", model,
                    "messages", List.of(
                            Map.of("role", "system", "content", "You are an expert nutritionist. Output ONLY valid JSON."),
                            Map.of("role", "user", "content", formattedPrompt)
                    ),
                    "temperature", 0.1,
                    "response_format", Map.of("type", "json_object")
            ), TEXT_MODELS);

            String jsonText = extractResponseText(response.getBody());
            WhoAssessmentDTO parsed = objectMapper.readValue(jsonText, WhoAssessmentDTO.class);
            WhoAssessmentDTO augmented = new WhoAssessmentDTO(
                parsed.productName(),
                parsed.ingredientsFound(),
                parsed.whoFlags(),
                parsed.overallIndicator(),
                parsed.globalEquivalent(),
                servingSize,
                quantity,
                null
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
