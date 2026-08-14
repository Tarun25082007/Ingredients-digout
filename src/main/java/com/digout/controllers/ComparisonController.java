package com.digout.controllers;

import com.digout.dto.OpenFoodFactsDTO;
import com.digout.services.OpenFoodFactsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/compare")
public class ComparisonController {

    private final OpenFoodFactsService openFoodFactsService;

    public ComparisonController(OpenFoodFactsService openFoodFactsService) {
        this.openFoodFactsService = openFoodFactsService;
    }

    @GetMapping("/search")
    public ResponseEntity<?> compareProductByName(@RequestParam String name) {
        try {
            OpenFoodFactsDTO data = openFoodFactsService.searchProductByName(name);
            return ResponseEntity.ok(data);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }
}
