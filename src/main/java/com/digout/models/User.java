package com.digout.models;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
@Getter
@Setter
@ToString
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "canonical_email", nullable = false, unique = true)
    private String canonicalEmail;

    @Column(name = "google_id", unique = true)
    private String googleId;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "full_name")
    @jakarta.persistence.Convert(converter = com.digout.security.CryptoConverter.class)
    private String fullName;

    private String role;

    private Integer age;

    @Column(name = "gender")
    @Builder.Default
    private String gender = "PREFER_NOT_TO_SAY";

    @Column(name = "height_cm")
    private Double heightCm;

    @Column(name = "weight_kg")
    private Double weightKg;

    @Column(name = "activity_level")
    @Builder.Default
    private String activityLevel = "MODERATE";

    @Column(name = "calorie_goal")
    @Builder.Default
    private String calorieGoal = "MAINTENANCE";

    @Column(name = "medical_conditions", columnDefinition = "TEXT")
    @jakarta.persistence.Convert(converter = com.digout.security.CryptoConverter.class)
    @Builder.Default
    private String medicalConditions = "";

    @Column(name = "profile_completed")
    @Builder.Default
    private Boolean profileCompleted = false;

    @Column(name = "strictness_level")
    @Builder.Default
    private String strictnessLevel = "STANDARD";

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now(java.time.ZoneOffset.UTC);

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    @com.fasterxml.jackson.annotation.JsonIgnore
    @ToString.Exclude
    private java.util.List<ScanHistory> scanHistories;

    @PrePersist
    @PreUpdate
    public void populateCanonicalEmail() {
        if (this.email != null) {
            this.email = this.email.trim().toLowerCase();
            this.canonicalEmail = com.digout.util.EmailUtils.canonicalize(this.email);
        }
    }
}
